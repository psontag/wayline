"""Export the spike network as mock data for the web app.

Usage: python export_mock.py <extract.json> <dem_dir> <output_dir> [start_date]

Writes network.json, places.json, manifest.json and sample-trip.json.
"""

import datetime
import json
import os
import sys
from collections import defaultdict

# Shared modules live in pipeline/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import graph as G  # noqa: E402
import propose as P  # noqa: E402
from dem import Dem  # noqa: E402
from export import climb, export_network, export_places, line, node_elevation, profile, r5, shares, surface_shares  # noqa: E402

VERSION = "oberfranken-1"
HOTEL_STOP_KM = 2.0


def sample_trip(g, dem, places, start_date):
    case = next(c for c in P.CASES if c["id"] == "A")
    start = next(s for s in g["stations"] if s["name"] == case["start"])
    proposals = P.search_one_way(g, start, case, {})
    p = next((x for x in proposals if x["end"]["name"].startswith("Bad Rodach")), proposals[min(1, len(proposals) - 1)])

    # Track points with the edge each segment belongs to.
    pts, seg_edge = [p["start"]["loc"]], [None]
    for ei, fwd in p["steps"]:
        c = g["edges"][ei]["coords"]
        c = c if fwd else c[::-1]
        pts += c
        seg_edge += [ei] * len(c)
    pts.append(p["end"]["loc"])
    seg_edge.append(None)
    km = [0.0]
    for a, b in zip(pts, pts[1:]):
        km.append(km[-1] + G.dist_km(a, b))

    stops = P.cut_stages(g, pts, km, case["days"], case["km_per_day"])
    cut = [0] + [s["idx"] for s in stops] + [len(pts) - 1]

    def place(name, kind, loc, osm_id=None):
        out = {"name": name, "kind": kind, "coord": [r5(loc[0]), r5(loc[1])]}
        if osm_id:
            out["osmId"] = osm_id
        return out

    start_place = place(p["start"]["name"], "station", p["start"]["loc"], f"n{p['start']['id']}")
    stages = []
    prev = start_place
    for i in range(len(cut) - 1):
        a, b = cut[i], cut[i + 1]
        seg = pts[a : b + 1]
        if i < len(stops):
            t = stops[i]["town"]
            end = place(t["name"], "town", t["loc"], f"n{t['id']}")
            end["alternatives"] = [place(x["town"]["name"], "town", x["town"]["loc"], f"n{x['town']['id']}") for x in stops[i]["alternatives"]]
            hotel = nearest_hotel(places["hotels"], t["loc"])
        else:
            end = place(p["end"]["name"], "station", p["end"]["loc"], f"n{p['end']['id']}")
            end["alternatives"] = []
            hotel = None
        end["locked"] = False

        dense = profile(dem, seg, node_elevation(dem, seg[0]), node_elevation(dem, seg[-1]))
        up, down = climb(dense)
        surface_km = defaultdict(float)
        for k in range(a + 1, b + 1):
            ei = seg_edge[k]
            d = km[k] - km[k - 1]
            if ei is None:
                surface_km["paved"] += d
                continue
            e = g["edges"][ei]
            for s, v in surface_shares(e["surface_km"]).items():
                surface_km[s] += d * v / e["len"]
        surface = shares(surface_km)
        distance = round((km[b] - km[a]) * 1000)
        leg = {
            "from": prev["coord"],
            "to": end["coord"],
            **line(dense),
            "distance": distance,
            "ascent": round(up),
            "descent": round(down),
            "surface": surface,
            "provider": "fake",
            "profileHash": "touring",
        }
        stage = {
            "id": f"stage-{i + 1}",
            "start": prev,
            "end": end,
            "via": [],
            "legs": [leg],
            "stats": {"distance": distance, "ascent": round(up), "descent": round(down), "surface": surface},
        }
        if hotel:
            stage["hotel"] = hotel
        stages.append(stage)
        prev = {k: v for k, v in end.items() if k not in ("locked", "alternatives")}

    names = [s["end"]["name"] for s in stages]
    return {
        "schemaVersion": 1,
        "id": "sample-bamberg-bad-rodach",
        "name": f"{start_place['name']} – {names[-1]}",
        "owner": "me",
        "createdAt": f"{datetime.date.today()}T08:00:00.000Z",
        "updatedAt": f"{datetime.date.today()}T08:00:00.000Z",
        "kind": "one-way",
        "startDate": start_date,
        "settings": {"profile": "touring", "kmPerDay": case["km_per_day"], "maxAscentPerDay": 1400, "hotelBudget": "mid", "startTime": "09:00", "avgSpeed": 18},
        "stages": stages,
        "sharedWith": [],
    }


def nearest_hotel(hotels, loc):
    best = None
    for h in hotels:
        d = G.dist_km(loc, [h["lon"], h["lat"]])
        if d <= HOTEL_STOP_KM and (best is None or d < best[0]):
            best = (d, h)
    if best is None:
        return None
    h = best[1]
    out = {"osmId": h["id"], "name": h["name"], "coord": [h["lon"], h["lat"]]}
    for k in ("stars", "website"):
        if k in h:
            out[k] = h[k]
    return out


# --- main ----------------------------------------------------------------------


def write(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{os.path.basename(path)}: {os.path.getsize(path) / 1e6:.2f} MB")


def main(src, dem_dir, out_dir, start_date=None):
    start_date = start_date or (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
    with open(src) as f:
        data = json.load(f)
    g = G.build(data)
    dem = Dem(dem_dir)
    os.makedirs(out_dir, exist_ok=True)

    network, index = export_network(g, dem, VERSION)
    places = export_places(data, g, index, VERSION)
    lons = [n["lon"] for n in network["nodes"]]
    lats = [n["lat"] for n in network["nodes"]]
    manifest = {
        "version": VERSION,
        "region": {"name": "Oberfranken", "bbox": [min(lons), min(lats), max(lons), max(lats)]},
        "files": {"network": "network.json", "places": "places.json"},
        "createdAt": datetime.date.today().isoformat(),
    }
    write(os.path.join(out_dir, "network.json"), network)
    write(os.path.join(out_dir, "places.json"), places)
    write(os.path.join(out_dir, "manifest.json"), manifest)
    write(os.path.join(out_dir, "sample-trip.json"), sample_trip(g, dem, places, start_date))


if __name__ == "__main__":
    main(*sys.argv[1:5])
