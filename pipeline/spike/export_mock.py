"""Export the spike network as mock data for the web app.

Usage: python export_mock.py <extract.json> <dem_dir> <output_dir> [start_date]

Writes network.json, places.json, manifest.json and sample-trip.json.
Geometry is an encoded polyline (Google format, 5 decimals, lat before lon).
Elevation is a separate list of whole meters, one per point.
"""

import datetime
import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import graph as G  # noqa: E402
import propose as P  # noqa: E402
from dem import Dem  # noqa: E402

VERSION = "oberfranken-1"
SAMPLE_KM = 0.05  # DEM sample spacing
SMOOTH = 4  # samples on each side, about 450 m, to damp DSM noise
SIMPLIFY_M = 15  # horizontal tolerance
SIMPLIFY_ELE_M = 5  # vertical tolerance
HOTEL_STOP_KM = 2.0
SURFACE = {"paved": "paved", "gravel": "gravel", "unknown": "gravel", "rough": "unpaved"}


# --- elevation and geometry -------------------------------------------------


def elevation(dem, lon, lat):
    e = dem.elevation(lon, lat)
    return 0.0 if e is None else e


def node_elevation(dem, loc):
    """Mean of the point and a 75 m ring. Shared by all edges at a node."""
    pts = [loc]
    for k in range(8):
        a = k * math.pi / 4
        pts.append([loc[0] + 0.075 / (111.32 * math.cos(math.radians(loc[1]))) * math.cos(a), loc[1] + 0.075 / 111.32 * math.sin(a)])
    return sum(elevation(dem, *p) for p in pts) / len(pts)


def densify(coords):
    out = [coords[0]]
    for a, b in zip(coords, coords[1:]):
        n = max(1, math.ceil(G.dist_km(a, b) / SAMPLE_KM))
        for k in range(1, n + 1):
            f = k / n
            out.append([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
    return out


def profile(dem, coords, start_ele, end_ele):
    """Dense points [lon, lat, ele]. Ends are pinned to the node elevations."""
    pts = densify(coords)
    raw = [elevation(dem, *p) for p in pts]
    n = len(raw)
    smooth = []
    for i in range(n):
        w = raw[max(0, i - SMOOTH) : i + SMOOTH + 1]
        smooth.append(sum(w) / len(w))
    smooth[0], smooth[-1] = start_ele, end_ele
    # Blend toward the pinned ends so there is no step next to a node.
    for i in range(1, min(SMOOTH, n - 1)):
        f = i / SMOOTH
        smooth[i] = start_ele * (1 - f) + smooth[i] * f
        j = n - 1 - i
        smooth[j] = end_ele * (1 - f) + smooth[j] * f
    return [[p[0], p[1], e] for p, e in zip(pts, smooth)]


def climb(pts):
    up = down = 0.0
    for a, b in zip(pts, pts[1:]):
        d = b[2] - a[2]
        if d > 0:
            up += d
        else:
            down -= d
    return up, down


def simplify(pts):
    """Douglas-Peucker on horizontal and vertical error."""
    if len(pts) < 3:
        return pts
    lat0 = math.radians(pts[0][1])
    xy = [(p[0] * 111320 * math.cos(lat0), p[1] * 110540) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (ax, ay), (bx, by) = xy[i], xy[j]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        worst, worst_k = 1.0, None
        for k in range(i + 1, j):
            px, py = xy[k]
            t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
            h = math.hypot(px - ax - t * dx, py - ay - t * dy)
            v = abs(pts[k][2] - (pts[i][2] + (pts[j][2] - pts[i][2]) * t))
            err = max(h / SIMPLIFY_M, v / SIMPLIFY_ELE_M)
            if err > worst:
                worst, worst_k = err, k
        if worst_k is not None:
            keep[worst_k] = True
            stack += [(i, worst_k), (worst_k, j)]
    return [p for p, k in zip(pts, keep) if k]


def encode(pts):
    """Encoded polyline of [lon, lat, ...] points."""
    out = []
    prev = [0, 0]
    for p in pts:
        cur = [round(p[1] * 1e5), round(p[0] * 1e5)]
        for v, pv in zip(cur, prev):
            d = v - pv
            d = ~(d << 1) if d < 0 else d << 1
            while d >= 0x20:
                out.append(chr((0x20 | (d & 0x1F)) + 63))
                d >>= 5
            out.append(chr(d + 63))
        prev = cur
    return "".join(out)


def line(pts):
    pts = simplify(pts)
    return {"geometry": encode(pts), "elevation": [round(p[2]) for p in pts]}


def r5(x):
    return round(x, 5)


def shares(km):
    total = sum(km.values()) or 1.0
    return {k: round(km.get(k, 0.0) / total, 3) for k in ("paved", "gravel", "unpaved")}


def surface_shares(surface_km):
    km = defaultdict(float)
    for k, v in surface_km.items():
        km[SURFACE[k]] += v
    return km


# --- network ----------------------------------------------------------------


def main_component(g):
    adj = defaultdict(set)
    for e in g["edges"]:
        adj[e["a"]].add(e["b"])
        adj[e["b"]].add(e["a"])
    comp = G.components(adj)
    sizes = defaultdict(int)
    for c in comp.values():
        sizes[c] += 1
    main = max(sizes, key=sizes.get)
    return {n for n, c in comp.items() if c == main}


def export_network(g, dem):
    main = main_component(g)
    edges = [e for e in g["edges"] if e["a"] in main]

    osm_ids = sorted({e["a"] for e in edges} | {e["b"] for e in edges})
    index = {n: i for i, n in enumerate(osm_ids)}

    towns_at = {}
    for t in g["towns"]:
        cur = towns_at.get(t["node"])
        if cur is None or (t["hotels"], -t["snap_km"]) > (cur["hotels"], -cur["snap_km"]):
            towns_at[t["node"]] = t
    stations_at = {}
    for s in g["stations"]:
        cur = stations_at.get(s["node"])
        if cur is None or s["snap_km"] < cur["snap_km"]:
            stations_at[s["node"]] = s

    node_ele = {n: node_elevation(dem, g["coord"][n]) for n in osm_ids}
    nodes = []
    for n in osm_ids:
        c = g["coord"][n]
        town, station = towns_at.get(n), stations_at.get(n)
        node = {"id": index[n], "lon": r5(c[0]), "lat": r5(c[1]), "kind": "junction"}
        if station:
            node.update(kind="station", name=station["name"])
        elif town:
            node.update(kind="town", name=town["name"])
        node["hotelCount"] = town["hotels"] if town else 0
        nodes.append(node)

    out_edges = []
    for i, e in enumerate(edges):
        pts = profile(dem, e["coords"], node_ele[e["a"]], node_ele[e["b"]])
        up, down = climb(pts)
        net = max(e["km"].items(), key=lambda kv: kv[1])[0]
        surface = shares(surface_shares(e["surface_km"]))
        out_edges.append(
            {
                "id": i,
                "from": index[e["a"]],
                "to": index[e["b"]],
                "lengthKm": round(e["len"], 3),
                "pavedShare": surface["paved"],
                "surface": surface,
                # Routes without a known network tag count as local.
                "network": "lcn" if net == "other" else net,
                "routes": sorted(e["routes"], key=lambda r: -e["routes"][r]),
                "score": round(e["score"], 3),
                "ascent": round(up),
                "descent": round(down),
                **line(pts),
            }
        )
    return {"version": VERSION, "nodes": nodes, "edges": out_edges}, index


def export_places(data, g, index):
    towns_by_id = {t["id"]: t for t in g["towns"]}
    towns = []
    for p in data["places"]:
        t = towns_by_id.get(p["id"])
        towns.append(
            {
                "id": f"n{p['id']}",
                "name": p["name"],
                "place": p["place"],
                "lon": r5(p["loc"][0]),
                "lat": r5(p["loc"][1]),
                "hotelCount": t["hotels"] if t else 0,
                "nodeId": index.get(t["node"]) if t else None,
            }
        )
    stations = []
    for s in g["stations"]:
        stations.append({"id": f"n{s['id']}", "name": s["name"], "lon": r5(s["loc"][0]), "lat": r5(s["loc"][1]), "nodeId": index.get(s["node"])})
    hotels = []
    for h in data["hotels"]:
        if not h.get("name"):
            continue
        hotel = {"id": h["id"], "name": h["name"], "kind": h["kind"], "lon": r5(h["loc"][0]), "lat": r5(h["loc"][1])}
        stars = parse_stars(h.get("stars"))
        if stars:
            hotel["stars"] = stars
        if h.get("website"):
            hotel["website"] = h["website"]
        hotels.append(hotel)
    return {"version": VERSION, "towns": towns, "stations": stations, "hotels": hotels}


def parse_stars(s):
    if not s:
        return None
    try:
        v = float(s.rstrip("S").replace(",", "."))
    except ValueError:
        return None
    return v if 0 < v <= 5 else None


# --- sample trip -------------------------------------------------------------


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

    network, index = export_network(g, dem)
    places = export_places(data, g, index)
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
