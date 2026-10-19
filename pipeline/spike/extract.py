"""Extract cycling routes, towns, stations and hotels from an OSM PBF file.

Usage: python extract.py <input.osm.pbf> <output.json>
"""

import json
import sys

import osmium

ROUTE_NETWORKS = {"icn", "ncn", "rcn", "lcn"}
PLACES = {"city", "town", "village"}
HOTELS = {"hotel", "guest_house", "motel"}


def hotel_tags(t):
    return {
        "name": t.get("name"),
        "kind": t["tourism"],
        "stars": t.get("stars"),
        "website": t.get("website") or t.get("contact:website"),
    }


class RelationsAndPoints(osmium.SimpleHandler):
    """Pass 1: route relations and point features."""

    def __init__(self):
        super().__init__()
        self.routes = []
        self.route_way_ids = set()
        self.places = []
        self.stations = []
        self.hotels = []
        self.hotel_way_ids = {}

    def relation(self, r):
        t = r.tags
        if t.get("type") != "route" or t.get("route") != "bicycle":
            return
        if t.get("state") in ("proposed", "disused"):
            return
        ways = [m.ref for m in r.members if m.type == "w"]
        self.route_way_ids.update(ways)
        self.routes.append(
            {
                "id": r.id,
                "name": t.get("name") or t.get("ref") or f"relation {r.id}",
                "network": t.get("network") if t.get("network") in ROUTE_NETWORKS else "other",
                "ways": ways,
            }
        )

    def node(self, n):
        t = n.tags
        if not t:
            return
        loc = [round(n.location.lon, 6), round(n.location.lat, 6)]
        if t.get("place") in PLACES and "name" in t:
            self.places.append({"id": n.id, "name": t["name"], "place": t["place"], "loc": loc})
        if t.get("railway") in ("station", "halt") and t.get("station") not in ("subway", "light_rail", "miniature"):
            if t.get("usage") != "tourism" and "name" in t:
                self.stations.append({"id": n.id, "name": t["name"], "loc": loc})
        if t.get("tourism") in HOTELS:
            self.hotels.append({"id": f"n{n.id}", **hotel_tags(t), "loc": loc})

    def way(self, w):
        if w.tags.get("tourism") in HOTELS:
            self.hotel_way_ids[w.id] = hotel_tags(w.tags)


class Ways(osmium.SimpleHandler):
    """Pass 2: geometry of route ways and hotel buildings."""

    def __init__(self, route_way_ids, hotel_way_ids):
        super().__init__()
        self.route_way_ids = route_way_ids
        self.hotel_way_ids = hotel_way_ids
        self.ways = {}
        self.hotels = []

    def way(self, w):
        if w.id in self.route_way_ids:
            t = w.tags
            self.ways[w.id] = {
                "nodes": [n.ref for n in w.nodes],
                "coords": [[round(n.lon, 6), round(n.lat, 6)] for n in w.nodes],
                "highway": t.get("highway"),
                "surface": t.get("surface"),
                "tracktype": t.get("tracktype"),
            }
        if w.id in self.hotel_way_ids:
            pts = [(n.lon, n.lat) for n in w.nodes]
            lon = sum(p[0] for p in pts) / len(pts)
            lat = sum(p[1] for p in pts) / len(pts)
            self.hotels.append({"id": f"w{w.id}", **self.hotel_way_ids[w.id], "loc": [round(lon, 6), round(lat, 6)]})


def main(src, dst):
    p1 = RelationsAndPoints()
    p1.apply_file(src)
    p2 = Ways(p1.route_way_ids, p1.hotel_way_ids)
    p2.apply_file(src, locations=True, idx="flex_mem")

    out = {
        "routes": p1.routes,
        "ways": {str(k): v for k, v in p2.ways.items()},
        "places": p1.places,
        "stations": p1.stations,
        "hotels": p1.hotels + p2.hotels,
    }
    with open(dst, "w") as f:
        json.dump(out, f)
    print(
        f"routes={len(out['routes'])} ways={len(out['ways'])} places={len(out['places'])} "
        f"stations={len(out['stations'])} hotels={len(out['hotels'])}"
    )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
