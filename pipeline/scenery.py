"""What the route network passes: forest, water, vineyards, nature reserves and sights.

Usage: python scenery.py <input.osm.pbf>  (prints a summary)

Areas and rivers are drawn onto a grid of 50 m cells, one layer per class.
Each layer grows by a buffer. An edge's share of a class is the share of its
points (every 50 m) that fall on a cell of that class. Sights are points; an
edge counts the sights within 500 m.
"""

import json
import math
import sys

import numpy as np
import osmium
from PIL import Image, ImageDraw

# Grid over all states. Points outside count as no scenery.
WEST, SOUTH, EAST, NORTH = 7.4, 47.2, 14.0, 51.8
CELL_LON, CELL_LAT = 0.0007, 0.00045  # about 50 m at 49° N
WIDTH = math.ceil((EAST - WEST) / CELL_LON)
HEIGHT = math.ceil((NORTH - SOUTH) / CELL_LAT)

LAYERS = ("forest", "water", "vineyard", "nature")
MIN_LAKE_M2 = 50_000
NOT_LAKES = {"wastewater", "basin", "reflecting_pool", "fish_pass"}
STRICT_CLASSES = {"1", "1a", "1b", "2", "3", "4"}
SIGHT_KM = 0.5
SIGHTS = {
    "historic": {"castle", "ruins", "monastery", "city_gate"},
    "tourism": {"attraction", "viewpoint", "museum"},
}
WATERWAYS = {"river", "canal"}

TAGS = [
    ("landuse", "forest"),
    ("natural", "wood"),
    ("landuse", "vineyard"),
    ("natural", "water"),
    ("leisure", "nature_reserve"),
    ("boundary", "national_park"),
    ("boundary", "protected_area"),
    *(("waterway", v) for v in WATERWAYS),
    *((k, v) for k, vs in SIGHTS.items() for v in vs),
]


def area_layers(t):
    out = []
    if t.get("landuse") == "forest" or t.get("natural") == "wood":
        out.append("forest")
    if t.get("landuse") == "vineyard":
        out.append("vineyard")
    if t.get("natural") == "water" and t.get("water") not in NOT_LAKES:
        out.append("water")
    if is_nature(t):
        out.append("nature")
    return out


def is_nature(t):
    if t.get("leisure") == "nature_reserve" or t.get("boundary") == "national_park":
        return True
    if t.get("boundary") != "protected_area":
        return False
    if t.get("protect_class") in STRICT_CLASSES:
        return True
    # Not all of class 5: it also holds landscape protection areas, which cover a third of the land.
    # Some nature parks have another class, e.g. Geo-Naturpark Bergstraße-Odenwald.
    return "naturpark" in f"{t.get('protection_title', '')} {t.get('name', '')}".lower()


def is_sight(t):
    return "name" in t and any(t.get(k) in vs for k, vs in SIGHTS.items())


def px(lon, lat):
    # Pillow puts integer coordinates at pixel centers.
    return ((lon - WEST) / CELL_LON - 0.5, (NORTH - lat) / CELL_LAT - 0.5)


def ring_m2(ring):
    """Area of a [lon, lat] ring in square meters."""
    k = 111_320 * math.cos(math.radians(ring[0][1]))
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2 * k * 110_540


def draw(a, outers, inners=(), line=False):
    """Fill the outer rings minus the inner rings on the bool array a, or draw lines.

    Draws on a small image first, so holes don't erase other areas."""
    outers = [[px(*p) for p in r] for r in outers if len(r) >= (2 if line else 3)]
    if not outers:
        return
    xs = [p[0] for r in outers for p in r]
    ys = [p[1] for r in outers for p in r]
    x0, y0 = max(0, math.floor(min(xs))), max(0, math.floor(min(ys)))
    x1, y1 = min(WIDTH, math.ceil(max(xs)) + 2), min(HEIGHT, math.ceil(max(ys)) + 2)
    if x0 >= x1 or y0 >= y1:
        return
    tmp = Image.new("L", (x1 - x0, y1 - y0))
    d = ImageDraw.Draw(tmp)
    for r in outers:
        shifted = [(x - x0, y - y0) for x, y in r]
        if line:
            d.line(shifted, fill=1)
        else:
            d.polygon(shifted, fill=1)
    for r in inners:
        if len(r) >= 3:
            d.polygon([(x - x0, y - y0) for x, y in (px(*p) for p in r)], fill=0)
    a[y0:y1, x0:x1] |= np.asarray(tmp, dtype=bool)


def coords(nodes):
    return [(n.lon, n.lat) for n in nodes]


class Canvas:
    def __init__(self):
        self.layers = {k: np.zeros((HEIGHT, WIDTH), dtype=bool) for k in LAYERS}
        self.sights = {}

    def area(self, layers, rings, sight_key, tags):
        if "water" in layers and sum(ring_m2(o) for o, _ in rings) < MIN_LAKE_M2:
            layers.remove("water")
        for layer in layers:
            for outer, inners in rings:
                draw(self.layers[layer], [outer], inners)
        if is_sight(tags) and rings:
            pts = rings[0][0]
            self.sights[sight_key] = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def relations(src):
    """Area relations we need: {id: (layers, [(way id, role)])}."""
    out = {}
    fp = osmium.FileProcessor(src, osmium.osm.RELATION).with_filter(osmium.filter.TagFilter(*TAGS))
    for r in fp:
        t = r.tags
        if t.get("type") in ("multipolygon", "boundary") and (area_layers(t) or is_sight(t)):
            out[r.id] = (area_layers(t), [(m.ref, m.role) for m in r.members if m.type == "w"])
    return out


class WayFilter:
    """Filter that drops all ways except rivers, canals and the given ways (True means drop)."""

    def __init__(self, ids):
        self.ids = ids

    def way(self, w):
        return not (w.id in self.ids or w.tags.get("waterway") in WATERWAYS)


def extract(src):
    """Layers (bool arrays), sights {id: (lon, lat)} and parts of one PBF file.

    A state extract holds only the part of an area relation inside the state,
    e.g. of a nature park on the border. libosmium can't build those. Their
    ways go into parts, {relation id: [layers, {way id: [role, first node, last node, coords]}]},
    so merge() can join them with the parts from the other states."""
    rels = relations(src)
    members = {w for _, ms in rels.values() for w, _ in ms}
    seen = {w.id for w in osmium.FileProcessor(src, osmium.osm.WAY).with_filter(osmium.filter.IdFilter(members))}
    partial = {rid for rid, (_, ms) in rels.items() if any(w not in seen for w, _ in ms)}
    partial_ways = {w for rid in partial for w, _ in rels[rid][1] if w in seen}

    canvas = Canvas()
    ways = {}
    tags = osmium.filter.TagFilter(*TAGS)
    tags.enable_for(osmium.osm.NODE | osmium.osm.RELATION | osmium.osm.AREA)
    complete = osmium.filter.IdFilter(set(rels) - partial)
    fp = osmium.FileProcessor(src).with_areas(complete).with_filter(tags).with_filter(WayFilter(partial_ways))
    for obj in fp:
        try:
            if obj.is_area():
                rings = [(coords(o), [coords(i) for i in obj.inner_rings(o)]) for o in obj.outer_rings()]
                key = f"{'w' if obj.from_way() else 'r'}{obj.orig_id()}"
                canvas.area(area_layers(obj.tags), rings, key, obj.tags)
            elif obj.is_way():
                if obj.tags.get("waterway") in WATERWAYS:
                    draw(canvas.layers["water"], [coords(obj.nodes)], line=True)
                if obj.id in partial_ways:
                    ways[obj.id] = (obj.nodes[0].ref, obj.nodes[-1].ref, coords(obj.nodes))
            elif obj.is_node() and is_sight(obj.tags):
                canvas.sights[f"n{obj.id}"] = (obj.lon, obj.lat)
        except osmium.InvalidLocationError:
            pass

    parts = {}
    for rid in partial:
        layers, ms = rels[rid]
        if layers:
            got = {w: [role, *ways[w]] for w, role in ms if w in ways}
            parts[rid] = [layers, got]
    return canvas.layers, canvas.sights, parts


def join(ways):
    """Join ways [(first node, last node, coords)] into closed rings and open chains."""
    left = list(ways)
    closed, chains = [], []
    while left:
        first, last, line = left.pop()
        line = list(line)
        flipped = False
        while first != last:
            for i, (f, l, c) in enumerate(left):
                if f == last:
                    line += c[1:]
                    last = l
                    break
                if l == last:
                    line += c[::-1][1:]
                    last = f
                    break
            else:
                if flipped:
                    break
                # Try to grow the other end.
                line.reverse()
                first, last, flipped = last, first, True
                continue
            left.pop(i)
        (closed if first == last else chains).append(line)
    return closed, chains


def draw_parts(layers, parts):
    """Draw relations from the ways of all states onto packed layers. Areas that
    reach outside the region stay open: water closes them with a straight line
    (Bodensee), the other classes drop them."""
    for name in LAYERS:
        a = None
        for layer_names, ways in parts.values():
            if name not in layer_names:
                continue
            closed, chains = join([w[1:] for w in ways.values() if w[0] != "inner"])
            holes, _ = join([w[1:] for w in ways.values() if w[0] == "inner"])
            rings = closed + chains if name == "water" else closed
            if name == "water" and sum(ring_m2(r) for r in rings if len(r) >= 3) < MIN_LAKE_M2:
                continue
            if a is None:
                a = unpack(layers[name])
            draw(a, rings, holes)
        if a is not None:
            layers[name] = pack(a)


def pack(a):
    return np.packbits(a, axis=1)


def unpack(p):
    return np.unpackbits(p, axis=1, count=WIDTH).view(bool)


def dilate(a, square):
    """Grow a layer by one cell: to the 4 neighbors, or to all 8 if square."""
    p = np.pad(a, 1)
    out = a | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    if square:
        out |= p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
    return out


class Scenery:
    """Looks up the scenery of an edge. Takes the merged layers and sights of all states."""

    # Buffer in cells. Pillow already draws areas about half a cell too large.
    BUFFER = {"forest": 1, "water": 3, "vineyard": 2, "nature": 0}

    def __init__(self, layers, sights):
        """Layers are packed (see pack)."""
        self.layers = {}
        for k, p in layers.items():
            if self.BUFFER[k]:
                a = unpack(p)
                for i in range(self.BUFFER[k]):
                    a = dilate(a, square=i % 2 == 1)
                p = pack(a)
            self.layers[k] = p
        self.cell_lon = SIGHT_KM / (111.32 * math.cos(math.radians(NORTH)))
        self.cell_lat = SIGHT_KM / 110.54
        self.buckets = {}
        for lon, lat in sights.values():
            self.buckets.setdefault(self.bucket(lon, lat), []).append((lon, lat))

    def bucket(self, lon, lat):
        return (math.floor(lon / self.cell_lon), math.floor(lat / self.cell_lat))

    def edge(self, pts):
        """Scenery of an edge from its dense [lon, lat, ...] points."""
        lon = np.array([p[0] for p in pts])
        lat = np.array([p[1] for p in pts])
        x = np.floor((lon - WEST) / CELL_LON).astype(int)
        y = np.floor((NORTH - lat) / CELL_LAT).astype(int)
        ok = (x >= 0) & (x < WIDTH) & (y >= 0) & (y < HEIGHT)
        out = {}
        for k, a in self.layers.items():
            xs = x[ok]
            hits = ((a[y[ok], xs >> 3] >> (7 - (xs & 7))) & 1).sum()
            out[k] = round(float(hits) / len(pts), 2)
        out["sights"] = self.sights_near(lon[::2], lat[::2])
        return out

    def sights_near(self, lon, lat):
        cells = {self.bucket(a, b) for a, b in zip(lon, lat)}
        near = {(cx + dx, cy + dy) for cx, cy in cells for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
        cand = [s for c in near for s in self.buckets.get(c, ())]
        if not cand:
            return 0
        c = np.array(cand)
        kx = 111.32 * np.cos(np.radians(lat.mean()))
        dx = (c[:, 0:1] - lon[None, :]) * kx
        dy = (c[:, 1:2] - lat[None, :]) * 110.54
        return int(((dx * dx + dy * dy).min(axis=1) <= SIGHT_KM**2).sum())


def merge(states):
    """Merge the (packed layers, sights, parts) of several states, as load() returns them.
    Returns the packed layers and sights."""
    layers, sights, parts = None, {}, {}
    for state_layers, state_sights, state_parts in states:
        if layers is None:
            layers = state_layers
        else:
            for k in LAYERS:
                layers[k] |= state_layers[k]
        sights.update(state_sights)
        for rid, (names, ways) in state_parts.items():
            parts.setdefault(rid, [names, {}])[1].update(ways)
    draw_parts(layers, parts)
    return layers, sights


def save(path, layers, sights, parts):
    ids = list(sights)
    np.savez_compressed(
        path,
        **{k: pack(a) for k, a in layers.items()},
        sight_ids=np.array(ids),
        sight_locs=np.array([sights[i] for i in ids], dtype=float).reshape(-1, 2),
        parts=np.array(json.dumps(parts)),
    )


def extract_to(src, path):
    save(path, *extract(src))


def load(path):
    with np.load(path) as f:
        layers = {k: f[k] for k in LAYERS}
        sights = {str(i): (float(a), float(b)) for i, (a, b) in zip(f["sight_ids"], f["sight_locs"])}
        parts = json.loads(str(f["parts"]))
    return layers, sights, parts


def stats(edges):
    """Mean shares weighted by km, and how many edges see how many sights."""
    km = sum(e["lengthKm"] for e in edges) or 1.0
    means = {k: round(sum(e["scenery"][k] * e["lengthKm"] for e in edges) / km, 3) for k in LAYERS}
    bins = {"0": 0, "1": 0, "2-4": 0, "5-9": 0, "10+": 0}
    for e in edges:
        n = e["scenery"]["sights"]
        bins["0" if n == 0 else "1" if n == 1 else "2-4" if n < 5 else "5-9" if n < 10 else "10+"] += 1
    return {"mean_share": means, "sights": bins}


if __name__ == "__main__":
    layers, sights, parts = extract(sys.argv[1])
    print({k: int(a.sum()) for k, a in layers.items()}, f"sights={len(sights)} partial relations={len(parts)}")
