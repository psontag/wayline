"""Extract cycling routes, towns, stations and hotels from an OSM PBF file.

Usage: python extract.py <input.osm.pbf> <output.json>

Reads the file three times: relations, ways with their node locations, and
tagged nodes. Osmium filters in C++, so Python sees only the objects it needs.
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


def is_train_station(t):
    """Stations of the main rail network. Tram and light rail stops are often
    tagged train=yes, so we ask for a DB station code instead."""
    if t.get("railway") not in ("station", "halt") or "name" not in t:
        return False
    if t.get("station") in ("subway", "light_rail", "miniature", "funicular", "tram"):
        return False
    if t.get("usage") == "tourism" or t.get("public_transport") == "stop_position":
        return False
    return "railway:ref" in t or "railway:ref:DBAG" in t or t.get("uic_ref", "").startswith("80")


def population(t):
    try:
        return int(t.get("population", "").replace(".", "").replace(" ", ""))
    except ValueError:
        return None


class Relations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.routes = {}
        self.children = {}

    def relation(self, r):
        t = r.tags
        if t.get("type") != "route" or t.get("route") != "bicycle":
            return
        if t.get("state") in ("proposed", "disused"):
            return
        self.routes[r.id] = {
            "id": r.id,
            # Basic networks hold all local cycleways of an area. Their name is no route name.
            "name": None if t.get("network:type") == "basic_network" else t.get("name") or t.get("ref"),
            "network": t.get("network") if t.get("network") in ROUTE_NETWORKS else "other",
            "ways": [m.ref for m in r.members if m.type == "w"],
        }
        self.children[r.id] = [m.ref for m in r.members if m.type == "r"]

    def resolve(self):
        """Parent routes (e.g. EuroVelo) get the ways of their child routes."""

        def ways(rid, seen):
            if rid in seen or rid not in self.routes:
                return []
            seen.add(rid)
            out = list(self.routes[rid]["ways"])
            for c in self.children[rid]:
                out += ways(c, seen)
            return out

        for rid, route in self.routes.items():
            if self.children[rid]:
                route["ways"] = list(dict.fromkeys(ways(rid, set())))
        return [r for r in self.routes.values() if r["ways"]]


class Ways(osmium.SimpleHandler):
    def __init__(self, route_way_ids):
        super().__init__()
        self.route_way_ids = route_way_ids
        self.ways = {}
        self.hotel_ways = {}

    def way(self, w):
        t = w.tags
        route = w.id in self.route_way_ids
        hotel = t.get("tourism") in HOTELS
        if not (route or hotel):
            return
        # Nodes outside the extract have no location.
        nodes = [(n.ref, [round(n.lon, 6), round(n.lat, 6)]) for n in w.nodes if n.location.valid()]
        if route and len(nodes) >= 2:
            self.ways[str(w.id)] = {
                "nodes": [i for i, _ in nodes],
                "highway": t.get("highway"),
                "surface": t.get("surface"),
                "tracktype": t.get("tracktype"),
                "coords": [c for _, c in nodes],
            }
        if hotel and nodes:
            lon = sum(c[0] for _, c in nodes) / len(nodes)
            lat = sum(c[1] for _, c in nodes) / len(nodes)
            self.hotel_ways[w.id] = {**hotel_tags(t), "loc": [round(lon, 6), round(lat, 6)]}


class Nodes(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.places = []
        self.stations = []
        self.hotels = []

    def node(self, n):
        t = n.tags
        loc = [round(n.location.lon, 6), round(n.location.lat, 6)]
        if t.get("place") in PLACES and "name" in t:
            place = {"id": n.id, "name": t["name"], "place": t["place"], "loc": loc}
            pop = population(t)
            if pop:
                place["population"] = pop
            self.places.append(place)
        if is_train_station(t):
            self.stations.append({"id": n.id, "name": t["name"], "loc": loc})
        if t.get("tourism") in HOTELS:
            self.hotels.append({"id": f"n{n.id}", **hotel_tags(t), "loc": loc})


def extract(src):
    rel = Relations()
    rel.apply_file(src)
    routes = rel.resolve()
    route_way_ids = {w for r in routes for w in r["ways"]}

    # Osmium keeps the node locations in C++. Python only sees ways.
    ways = Ways(route_way_ids)
    ways.apply_file(src, locations=True, idx="flex_mem")

    # Only tagged nodes reach Python.
    nodes = Nodes()
    nodes.apply_file(src, filters=[osmium.filter.EntityFilter(osmium.osm.NODE), osmium.filter.KeyFilter("place", "railway", "tourism")])

    hotels = nodes.hotels + [{"id": f"w{wid}", **h} for wid, h in ways.hotel_ways.items()]
    return {"routes": routes, "ways": ways.ways, "places": nodes.places, "stations": nodes.stations, "hotels": hotels}


def merge(parts):
    """Merge extracts of neighboring areas. Features on both sides of a border count once."""
    out = {"routes": {}, "ways": {}, "places": {}, "stations": {}, "hotels": {}}
    for p in parts:
        for r in p["routes"]:
            cur = out["routes"].get(r["id"])
            if cur:
                cur["ways"] = list(dict.fromkeys(cur["ways"] + r["ways"]))
            else:
                out["routes"][r["id"]] = r
        out["ways"].update(p["ways"])
        for k in ("places", "stations", "hotels"):
            out[k].update({x["id"]: x for x in p[k]})
    return {"ways": out["ways"], **{k: list(v.values()) for k, v in out.items() if k != "ways"}}


def summary(data):
    return " ".join(f"{k}={len(v)}" for k, v in data.items())


def main(src, dst):
    data = extract(src)
    with open(dst, "w") as f:
        json.dump(data, f)
    print(summary(data))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
