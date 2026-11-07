"""Spike #81: two-layer routing graph for one OSM extract.

Writes the graph of all bikeable ways as Int32 arrays for route.mjs, and
the gzipped size of backbone and street tiles for each backbone choice.

    uv run spike/routing/build.py cache/osm/hessen-latest.osm.pbf spike/routing/out
"""

import functools
import gzip
import json
import math
import os
import sys
import time
from array import array
from collections import Counter, defaultdict

import osmium

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from dem import Dem  # noqa: E402

DEM = Dem(os.path.join(os.path.dirname(__file__), "..", "..", "cache", "dem"))


@functools.cache
def elevation(lon, lat):
    return round(DEM.elevation(lon / 1e5, lat / 1e5) or 0)

TILE = 0.25
SIMPLIFY_M = 5.0

# Edge level. A backbone choice k keeps edges with level <= k.
SIGNED, CYCLEWAY, QUIET_ROAD, RESIDENTIAL, OTHER = range(5)
LEVEL_NAMES = ["signed", "+cycleways and paved tracks", "+unclassified and tertiary", "+residential", "all streets"]

BIKE_ROADS = {
    "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "unclassified", "residential", "living_street", "service", "road", "cycleway", "track", "path",
}
PAVED = {"asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "chipseal", "sett", "metal", "wood"}
GRAVEL = {"compacted", "fine_gravel", "gravel", "pebblestone"}

# Rough stand-in for BRouter "touring": cost per meter by way type.
HIGHWAY_COST = {
    "cycleway": 1.0, "living_street": 1.1, "residential": 1.15, "unclassified": 1.2, "service": 1.3,
    "road": 1.3, "track": 1.2, "path": 1.4, "footway": 1.4, "pedestrian": 1.4, "bridleway": 1.8,
    "tertiary": 1.4, "tertiary_link": 1.4, "secondary": 2.2, "secondary_link": 2.2,
    "primary": 3.5, "primary_link": 3.5, "trunk": 5.0, "trunk_link": 5.0,
}
SIGNED_FACTOR = 0.8
HIGHWAYS = list(HIGHWAY_COST)


def bikeable(t):
    hw = t.get("highway")
    if not hw or t.get("area") == "yes" or hw == "steps":
        return False
    bike = t.get("bicycle")
    if bike in ("no", "private", "use_sidepath"):
        return False
    if bike in ("yes", "designated", "permissive", "dismount"):
        return True
    if t.get("access") in ("no", "private"):
        return False
    return hw in BIKE_ROADS


def surface(t):
    s = t.get("surface")
    if s:
        return "paved" if s in PAVED else "gravel" if s in GRAVEL else "rough"
    tt = t.get("tracktype")
    if tt == "grade1":
        return "paved"
    if tt in ("grade2", "grade3"):
        return "gravel"
    if tt in ("grade4", "grade5"):
        return "rough"
    return "unknown" if t.get("highway") in ("track", "path") else "paved"


def has_bike_lane(t):
    return any(t.get(k, "no") not in ("no", "none", "separate") for k in ("cycleway", "cycleway:both", "cycleway:right", "cycleway:left"))


def cost_factor(t, signed):
    hw = t.get("highway")
    f = HIGHWAY_COST.get(hw, 1.5)
    if hw in ("primary", "primary_link", "secondary", "secondary_link") and has_bike_lane(t):
        f = 1.4
    if hw == "path" and t.get("bicycle") == "designated":
        f = 1.05
    f *= {"paved": 1.0, "gravel": 1.2, "rough": 2.0, "unknown": 1.3}[surface(t)]
    return f * (SIGNED_FACTOR if signed else 1.0)


def brouter_bits(t, signed):
    """Tags the BRouter-like cost model in route.mjs needs, packed into one int."""
    hw = t.get("highway")
    s, sm = t.get("surface"), t.get("smoothness")
    paved = s in ("paved", "asphalt", "concrete", "paving_stones", "sett") or sm in ("excellent", "good")
    unpaved = not (paved or (not s and not sm) or s in ("fine_gravel", "cobblestone") or sm in ("intermediate", "bad"))
    bike = (
        t.get("bicycle_road") == "yes" or t.get("cyclestreet") == "yes" or t.get("lcn") == "yes"
        or t.get("bicycle") in ("yes", "permissive", "designated") or has_bike_lane(t)
    )
    grade = {"grade1": 1, "grade2": 2, "grade3": 3, "grade4": 4, "grade5": 5}.get(t.get("tracktype"), 0)
    hw_index = HIGHWAYS.index(hw) if hw in HIGHWAYS else len(HIGHWAYS)
    return hw_index | grade << 5 | paved << 8 | unpaved << 9 | bike << 10 | signed << 11


def descents(part):
    """Meters of descent from -> to and to -> from, BRouter style: 10 m hysteresis,
    then the part steeper than 1.5 % (downhillcutoff)."""
    z = [elevation(p[1], p[2]) for p in part]
    length = sum(meters(a, b) for a, b in zip(part, part[1:]))

    def down(zs):
        ref, total = zs[0], 0.0
        for v in zs[1:]:
            if v < ref - 10:
                total += ref - 10 - v
                ref = v + 10
            elif v > ref:
                ref = v
        return max(0, round(total - 0.015 * length))

    return down(z), down(z[::-1])


def level(t, signed):
    if signed:
        return SIGNED
    hw = t.get("highway")
    if hw == "cycleway" or (hw in ("track", "path") and surface(t) == "paved"):
        return CYCLEWAY
    if hw in ("unclassified", "tertiary", "tertiary_link"):
        return QUIET_ROAD
    if hw in ("residential", "living_street"):
        return RESIDENTIAL
    return OTHER


def directions(t):
    """(forward allowed, backward allowed) for bikes."""
    if t.get("oneway:bicycle") == "no" or t.get("cycleway") in ("opposite", "opposite_lane", "opposite_track"):
        return True, True
    ow = t.get("oneway", "roundabout" if t.get("junction") == "roundabout" else "no")
    if ow in ("yes", "1", "true", "roundabout"):
        return True, False
    if ow == "-1":
        return False, True
    return True, True


class Relations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = set()

    def relation(self, r):
        if r.tags.get("type") == "route" and r.tags.get("route") == "bicycle":
            self.ways.update(m.ref for m in r.members if m.type == "w")


class Ways(osmium.SimpleHandler):
    def __init__(self, signed_ways):
        super().__init__()
        self.signed_ways = signed_ways
        self.ways = []
        self.uses = Counter()
        self.places = []

    def node(self, n):
        if n.tags.get("place") in ("city", "town", "village") and "name" in n.tags:
            self.places.append({"name": n.tags["name"], "lon": n.location.lon, "lat": n.location.lat})

    def way(self, w):
        t = w.tags
        if not bikeable(t):
            return
        pts = [(n.ref, round(n.location.lon * 1e5), round(n.location.lat * 1e5)) for n in w.nodes if n.location.valid()]
        if len(pts) < 2:
            return
        signed = w.id in self.signed_ways
        fwd, bwd = directions(t)
        hw = t.get("highway")
        bits = brouter_bits(t, signed)
        self.ways.append((pts, level(t, signed), cost_factor(t, signed), fwd, bwd, surface(t), bits))
        for i, p in enumerate(pts):
            self.uses[p[0]] += 2 if i in (0, len(pts) - 1) else 1


def meters(a, b):
    x = (b[1] - a[1]) * 1.11 * math.cos(math.radians(a[2] / 1e5))
    y = (b[2] - a[2]) * 1.11
    return math.hypot(x, y)


def simplify(pts):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]
        scale = math.cos(math.radians(a[2] / 1e5))
        dx, dy = (b[1] - a[1]) * scale, b[2] - a[2]
        length = math.hypot(dx, dy) or 1
        worst, at = -1, -1
        for k in range(i + 1, j):
            px, py = (pts[k][1] - a[1]) * scale, pts[k][2] - a[2]
            d = abs(dx * py - dy * px) / length * 1.11
            if d > worst:
                worst, at = d, k
        if worst > SIMPLIFY_M:
            keep[at] = True
            stack += [(i, at), (at, j)]
    return [p for p, k in zip(pts, keep) if k]


def varint(out, v):
    v = (v << 1) ^ (v >> 63)
    while v >= 0x80:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v)


def tile_of(p):
    return f"{math.floor(p[1] / 1e5 / TILE)}_{math.floor(p[2] / 1e5 / TILE)}"


def encode(edges):
    """Gzipped bytes of one tile: (search part, geometry part).

    Search part: node coordinates, connections, one attribute byte, length.
    Geometry part: simplified shape points and one elevation byte per point.
    Elevation: one varint per point, in meters, as a delta to the point before.
    """
    node_ids = {}
    nodes, conn, attrs, lengths, geom, ele = (bytearray() for _ in range(6))
    last = (0, 0)
    for e in edges:
        pts = e["pts"]
        for p in (pts[0], pts[-1]):
            if p[0] not in node_ids:
                node_ids[p[0]] = len(node_ids)
                varint(nodes, p[1] - last[0])
                varint(nodes, p[2] - last[1])
                last = (p[1], p[2])
        varint(conn, node_ids[pts[0][0]])
        varint(conn, node_ids[pts[-1][0]])
        attrs.append(e["attr"])
        varint(lengths, e["len"])
        shape = simplify(pts)
        varint(geom, len(shape) - 2)
        for a, b in zip(shape[:-2], shape[1:-1]):
            varint(geom, b[1] - a[1])
            varint(geom, b[2] - a[2])
        prev = 0
        for p in shape:
            z = elevation(p[1], p[2])
            varint(ele, z - prev)
            prev = z
    search = bytes(nodes + conn + attrs + lengths)
    return len(gzip.compress(search, 9)), len(gzip.compress(bytes(geom + ele), 9))


def main(pbf, out):
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    rel = Relations()
    rel.apply_file(pbf)
    h = Ways(rel.ways)
    h.apply_file(pbf, locations=True, idx="flex_mem")
    print(f"read {len(h.ways)} ways, {len(rel.ways)} signed way ids in {time.time() - t0:.0f} s")

    node_ids = {}
    nodes = array("i")
    edges = array("i")
    shape = array("i")
    tiles = defaultdict(list)
    surfaces = "paved gravel rough unknown".split()

    def node(p):
        if p[0] not in node_ids:
            node_ids[p[0]] = len(node_ids)
            nodes.extend((p[1], p[2]))
        return node_ids[p[0]]

    way_bits = array("i")
    descent = array("i")
    for pts, lvl, factor, fwd, bwd, surf, bits in h.ways:
        start = 0
        for i in range(1, len(pts)):
            if i < len(pts) - 1 and h.uses[pts[i][0]] < 2:
                continue
            part = pts[start:i + 1]
            start = i
            m = max(1, round(sum(meters(a, b) for a, b in zip(part, part[1:]))))
            cost = max(1, round(m * factor))
            edges.extend((node(part[0]), node(part[-1]), m, cost if fwd else -1, cost if bwd else -1, lvl, len(shape) // 2))
            way_bits.append(bits)
            descent.extend(descents(part))
            for p in part[1:-1]:
                shape.extend((p[1], p[2]))
            attr = lvl * 16 + surfaces.index(surf) * 4 + fwd * 2 + bwd
            # An edge goes into the tile of each end, like the route tiles today.
            for key in {tile_of(part[0]), tile_of(part[-1])}:
                tiles[key].append({"pts": part, "len": m, "attr": attr, "level": lvl})
    shape.extend((0, 0))
    print(f"graph {len(node_ids)} nodes, {len(edges) // 7} edges in {time.time() - t0:.0f} s")

    for name, arr in (("nodes", nodes), ("edges", edges), ("shape", shape), ("ways", way_bits), ("descent", descent)):
        with open(f"{out}/{name}.bin", "wb") as f:
            arr.tofile(f)
    with open(f"{out}/places.json", "w") as f:
        json.dump(h.places, f)

    # Size of each tile per backbone choice, and of the street tiles (all levels).
    sizes = {}
    for key, tile_edges in sorted(tiles.items(), key=lambda kv: tuple(int(v) for v in kv[0].split("_"))[::-1]):
        sizes[key] = {}
        for k in range(OTHER + 1):
            kept = [e for e in tile_edges if e["level"] <= k]
            sizes[key][k] = encode(kept) if kept else (0, 0)
    with open(f"{out}/tiles.json", "w") as f:
        json.dump({"tile": TILE, "levels": LEVEL_NAMES, "highways": HIGHWAYS, "sizes": sizes}, f)

    km = [0.0] * (OTHER + 1)
    for i in range(0, len(edges), 7):
        km[edges[i + 5]] += edges[i + 2] / 1000
    for k in range(OTHER + 1):
        search = sum(s[k][0] for s in sizes.values()) / 2**20
        geom = sum(s[k][1] for s in sizes.values()) / 2**20
        print(f"level <= {k} ({LEVEL_NAMES[k]}): {sum(km[:k + 1]):.0f} km, search {search:.1f} MiB gz, geometry {geom:.1f} MiB gz")
    print(f"done in {time.time() - t0:.0f} s")


main(sys.argv[1], sys.argv[2])
