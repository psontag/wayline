"""Turn the route graph into the app's geodata format (packages/domain/src/geodata.ts).

Geometry is an encoded polyline (Google format, 5 decimals, lat before lon).
Elevation is a separate list of whole meters, one per point.
"""

import json
import math
import os
from collections import defaultdict

import graph as G

SAMPLE_KM = 0.05  # DEM sample spacing
SMOOTH = 4  # samples on each side, about 450 m, to damp DSM noise
SIMPLIFY_M = 15  # horizontal tolerance
SIMPLIFY_ELE_M = 5  # vertical tolerance
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


def dem_tile(loc):
    return (math.floor(loc[1]), math.floor(loc[0]))


def export_network(g, dem, version, scenery=None):
    """Nodes and edges of the largest connected part. Ids are array indexes.
    Edges get a scenery field if `scenery` (scenery.Scenery) is given."""
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

    # Work tile by tile, so only a few DEM tiles are in memory.
    node_ele = {n: node_elevation(dem, g["coord"][n]) for n in sorted(osm_ids, key=lambda n: dem_tile(g["coord"][n]))}
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

    out_edges = [None] * len(edges)
    for i in sorted(range(len(edges)), key=lambda i: dem_tile(edges[i]["coords"][0])):
        e = edges[i]
        pts = profile(dem, e["coords"], node_ele[e["a"]], node_ele[e["b"]])
        up, down = climb(pts)
        net = max(e["km"].items(), key=lambda kv: kv[1])[0]
        surface = shares(surface_shares(e["surface_km"]))
        out_edges[i] = {
            "id": i,
            "from": index[e["a"]],
            "to": index[e["b"]],
            "lengthKm": round(e["len"], 3),
            "pavedShare": surface["paved"],
            "surface": surface,
            # Routes without a known network tag count as local.
            "network": "lcn" if net == "other" else net,
            "routes": sorted(e["routes"], key=lambda r: (-e["routes"][r], r)),
            "score": round(e["score"], 3),
            "ascent": round(up),
            "descent": round(down),
            **line(pts),
        }
        if scenery:
            out_edges[i]["scenery"] = scenery.edge(pts)
    return {"version": version, "nodes": nodes, "edges": out_edges}, index


def export_places(data, g, index, version):
    towns_by_id = {t["id"]: t for t in g["towns"]}
    towns = []
    for p in data["places"]:
        t = towns_by_id.get(p["id"])
        town = {
            "id": f"n{p['id']}",
            "name": p["name"],
            "place": p["place"],
            "lon": r5(p["loc"][0]),
            "lat": r5(p["loc"][1]),
            "hotelCount": t["hotels"] if t else 0,
            "nodeId": index.get(t["node"]) if t else None,
        }
        if p.get("population"):
            town["population"] = p["population"]
        towns.append(town)
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
    return {"version": version, "towns": towns, "stations": stations, "hotels": hotels}


def read_places(data_dir):
    """All places of a built dataset: places.json, or the place tiles merged."""
    with open(os.path.join(data_dir, "manifest.json")) as f:
        manifest = json.load(f)
    if "places" in manifest["files"]:
        with open(os.path.join(data_dir, manifest["files"]["places"])) as f:
            return json.load(f)
    index = manifest["tiles"]["places"]
    out = {"version": manifest["version"], "towns": [], "stations": [], "hotels": []}
    for k in index["keys"]:
        with open(os.path.join(data_dir, index["path"].format(key=k))) as f:
            tile = json.load(f)
        for kind in ("towns", "stations", "hotels"):
            out[kind] += tile[kind]
    return out


def search_index(places):
    """Towns and stations on the network for place search. Short keys, no node ids."""
    out = []
    for t in places["towns"]:
        if t["nodeId"] is not None:
            entry = {"i": t["id"], "n": t["name"], "k": t["place"], "x": t["lon"], "y": t["lat"]}
            if t["hotelCount"]:
                entry["h"] = t["hotelCount"]
            out.append(entry)
    for s in places["stations"]:
        if s["nodeId"] is not None:
            out.append({"i": s["id"], "n": s["name"], "k": "station", "x": s["lon"], "y": s["lat"]})
    return {"version": places["version"], "places": out}


def split_places(places, nodes, tile_key):
    """Places per network tile. Towns and stations go with their node, so the
    planner finds them with it. The rest go by their position."""
    tiles = {}

    def tile(key):
        return tiles.setdefault(key, {"version": places["version"], "tile": key, "towns": [], "stations": [], "hotels": []})

    for kind in ("towns", "stations", "hotels"):
        for p in places[kind]:
            n = nodes[p["nodeId"]] if p.get("nodeId") is not None else p
            tile(tile_key(n["lon"], n["lat"]))[kind].append(p)
    return tiles


def parse_stars(s):
    if not s:
        return None
    try:
        v = float(s.rstrip("S").replace(",", "."))
    except ValueError:
        return None
    return v if 0 < v <= 5 else None


# --- network tiles ----------------------------------------------------------

TILE_MAGIC = b"WNT1"
KINDS = ["junction", "town", "station"]
CLASSES = ["icn", "ncn", "rcn", "lcn", "connector"]
SCENERY = ["forest", "water", "vineyard", "nature"]
NO_SCENERY = 0xFFFF


def decode_ints(s):
    """Encoded polyline to ([lon × 1e5, ...], [lat × 1e5, ...])."""
    lon, lat, i, x, y = [], [], 0, 0, 0
    while i < len(s):
        vals = []
        for _ in range(2):
            shift = result = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            vals.append(~(result >> 1) if result & 1 else result >> 1)
        y += vals[0]
        x += vals[1]
        lon.append(x)
        lat.append(y)
    return lon, lat


def pack_tile(tile):
    """A network tile as packed bytes. The format is in pipeline/README.md."""
    import numpy as np

    nodes, edges = tile["nodes"], tile["edges"]
    names, name_index = [], {}

    def name(s):
        if s not in name_index:
            name_index[s] = len(names)
            names.append(s)
        return name_index[s]

    def col(values, dtype, delta=False):
        a = np.asarray(values, dtype=np.int64)
        if delta:
            a = np.diff(a, prepend=0)
        return a.astype(dtype).tobytes()

    def k(v):
        return round(v * 1000)

    lon, lat, ele, counts = [], [], [], []
    for e in edges:
        x, y = decode_ints(e["geometry"])
        lon += x
        lat += y
        ele += e["elevation"]
        counts.append(len(x))
    route_refs = [name(r) for e in edges for r in e["routes"]]
    node_names = [name(n["name"]) if n.get("name") else -1 for n in nodes]
    blob = "\n".join(names).encode()
    scenery = [e.get("scenery") for e in edges]
    return b"".join([
        TILE_MAGIC,
        np.array([len(nodes), len(edges), len(lon), len(route_refs), len(blob)], dtype="<u4").tobytes(),
        blob,
        col([n["id"] for n in nodes], "<i4", delta=True),
        col([round(n["lon"] * 1e5) for n in nodes], "<i4", delta=True),
        col([round(n["lat"] * 1e5) for n in nodes], "<i4", delta=True),
        col([KINDS.index(n["kind"]) for n in nodes], "<u1"),
        col([n["hotelCount"] for n in nodes], "<u2"),
        col(node_names, "<i4"),
        col([e["id"] for e in edges], "<i4", delta=True),
        col([e["from"] for e in edges], "<i4"),
        col([e["to"] for e in edges], "<i4"),
        col([round(e["lengthKm"] * 1000) for e in edges], "<u4"),
        col([k(e["pavedShare"]) for e in edges], "<u2"),
        *(col([k(e["surface"][s]) for e in edges], "<u2") for s in ("paved", "gravel", "unpaved")),
        col([CLASSES.index(e["network"]) for e in edges], "<u1"),
        col([k(e["score"]) for e in edges], "<u2"),
        col([e["ascent"] for e in edges], "<u2"),
        col([e["descent"] for e in edges], "<u2"),
        *(col([k(s[f]) if s else NO_SCENERY for s in scenery], "<u2") for f in SCENERY),
        col([s["sights"] if s else NO_SCENERY for s in scenery], "<u2"),
        col([len(e["routes"]) for e in edges], "<u1"),
        col(counts, "<u4"),
        col(route_refs, "<u4"),
        varints(lon),
        varints(lat),
        varints(ele),
    ])  # fmt: skip


def varints(values):
    """Deltas of ints as zigzag varints: 7 bits per byte, low bits first."""
    out = bytearray()
    prev = 0
    for v in values:
        d = v - prev
        prev = v
        z = (d << 1) ^ (d >> 63)
        while z >= 0x80:
            out.append((z & 0x7F) | 0x80)
            z >>= 7
        out.append(z)
    return bytes(out)


def read_varints(b, pos, count):
    """(values, next pos) of varints()."""
    out, prev = [], 0
    for _ in range(count):
        z = shift = 0
        while True:
            byte = b[pos]
            pos += 1
            z |= (byte & 0x7F) << shift
            shift += 7
            if byte < 0x80:
                break
        prev += (z >> 1) ^ -(z & 1)
        out.append(prev)
    return out, pos


def load_tile(path):
    """A network tile, packed (.bin) or JSON."""
    if path.endswith(".bin"):
        return read_tile(path)
    with open(path) as f:
        return json.load(f)


def read_tile(path):
    """A network tile of pack_tile(), gzipped, as the dict it was made from."""
    import gzip

    import numpy as np

    with gzip.open(path, "rb") as f:
        b = f.read()
    if b[:4] != TILE_MAGIC:
        raise ValueError(f"{path} is not a network tile")
    n, m, p, r, size = np.frombuffer(b, "<u4", 5, 4).tolist()
    names = b[24 : 24 + size].decode().split("\n") if size else []
    pos = 24 + size

    def take(dtype, count, delta=False):
        nonlocal pos
        a = np.frombuffer(b, dtype, count, pos)
        pos += a.nbytes
        return (np.cumsum(a, dtype=np.int64) if delta else a).tolist()

    ids, lon, lat = take("<i4", n, True), take("<i4", n, True), take("<i4", n, True)
    kind, hotels, name_ref = take("<u1", n), take("<u2", n), take("<i4", n)
    e_id, e_from, e_to, length = take("<i4", m, True), take("<i4", m), take("<i4", m), take("<u4", m)
    paved_share = take("<u2", m)
    surface = [take("<u2", m) for _ in range(3)]
    network, score, ascent, descent = take("<u1", m), take("<u2", m), take("<u2", m), take("<u2", m)
    scenery = [take("<u2", m) for _ in range(5)]
    route_count, counts, route_refs = take("<u1", m), take("<u4", m), take("<u4", r)
    p_lon, pos = read_varints(b, pos, p)
    p_lat, pos = read_varints(b, pos, p)
    ele, pos = read_varints(b, pos, p)
    if pos != len(b):
        raise ValueError(f"{path} has extra bytes")

    nodes = []
    for i in range(n):
        node = {"id": ids[i], "lon": lon[i] / 1e5, "lat": lat[i] / 1e5, "kind": KINDS[kind[i]], "hotelCount": hotels[i]}
        if name_ref[i] >= 0:
            node["name"] = names[name_ref[i]]
        nodes.append(node)
    edges, at, ref = [], 0, 0
    for i in range(m):
        pts = [[p_lon[j] / 1e5, p_lat[j] / 1e5] for j in range(at, at + counts[i])]
        e = {
            "id": e_id[i], "from": e_from[i], "to": e_to[i], "lengthKm": length[i] / 1000,
            "pavedShare": paved_share[i] / 1000,
            "surface": {s: surface[j][i] / 1000 for j, s in enumerate(("paved", "gravel", "unpaved"))},
            "network": CLASSES[network[i]], "routes": [names[x] for x in route_refs[ref : ref + route_count[i]]],
            "score": score[i] / 1000, "ascent": ascent[i], "descent": descent[i],
            "geometry": encode(pts), "elevation": ele[at : at + counts[i]],
        }  # fmt: skip
        if scenery[0][i] != NO_SCENERY:
            e["scenery"] = {**{f: scenery[j][i] / 1000 for j, f in enumerate(SCENERY)}, "sights": scenery[4][i]}
        edges.append(e)
        at += counts[i]
        ref += route_count[i]
    return {"nodes": nodes, "edges": edges}
