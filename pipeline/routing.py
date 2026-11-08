"""Routing tiles: all bikeable ways, for the router in the browser.

extract() reads the ways and the elevation of each point. build() splits the ways at
junctions, keeps the largest connected part and writes two gzipped files per
tile: the search part (nodes and edges) and the geometry part (shape points
and elevation). The format is in the README.
"""

import gzip
import heapq
import math
import os
import shutil
from array import array
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import osmium

import extract as E

TILE_DEG = 0.25
FORMAT = 2
SEARCH_MAGIC = b"WRT2"
GEOMETRY_MAGIC = b"WRG1"
COORD = 1e6  # coordinates as int degrees x 1e6

# Way types in the order of their index in the edge attributes.
HIGHWAYS = [
    "cycleway", "living_street", "residential", "unclassified", "service", "road", "track", "path", "footway",
    "pedestrian", "bridleway", "tertiary", "tertiary_link", "secondary", "secondary_link", "primary",
    "primary_link", "trunk", "trunk_link", "ferry",
]  # fmt: skip
OTHER_HIGHWAY = 31
BIKE_ROADS = {
    "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "unclassified", "residential", "living_street", "service", "road", "cycleway", "track", "path",
}  # fmt: skip
PAVED = {"paved", "asphalt", "concrete", "paving_stones", "sett"}
# Roads that make noise around them.
BIG_ROADS = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"}
NOISE_CELLS = 2  # buffer of the big roads, in 50 m cells
# Streets that make a town: their km per km² within about 1.5 km.
TOWN_ROADS = {"residential", "living_street"}
TOWN_CELLS = 10  # 500 m cells for the street density
TOWN_KM = [1, 2, 4, 6, 8, 10]  # lower bounds of town classes 1-6
# Traffic class by way type. One more in towns (town class 3 and up).
TRAFFIC = {
    "unclassified": 1, "tertiary_link": 2, "tertiary": 3, "secondary_link": 3, "secondary": 4,
    "primary_link": 4, "primary": 5, "trunk_link": 5, "trunk": 6,
}  # fmt: skip

SAMPLE_M = 50  # DEM sample spacing
SMOOTH = 4  # samples on each side, to damp DSM noise
DOWNHILL_CUTOFF = 0.015  # gradients below this don't count, like BRouter's downhillcutoff
HYSTERESIS_M = 10  # dead band for the descent per edge
SIMPLIFY_M = 1.5  # an inner point closer than this to the line of its neighbors is dropped
CHUNK_POINTS = 2_000_000  # points per profile() call


def bikeable(t):
    hw = t.get("highway")
    if not hw:
        return t.get("route") == "ferry" and t.get("bicycle") != "no"
    if t.get("area") == "yes" or hw == "steps":
        return False
    bike = t.get("bicycle")
    if bike in ("no", "private", "use_sidepath"):
        return False
    if bike in ("yes", "designated", "permissive", "dismount"):
        return True
    if t.get("access") in ("no", "private"):
        return False
    return hw in BIKE_ROADS


def has_bike_lane(t):
    return any(t.get(k, "no") not in ("no", "none", "separate") for k in ("cycleway", "cycleway:both", "cycleway:right", "cycleway:left"))


def directions(t):
    """(forward, backward) allowed by bike."""
    if t.get("oneway:bicycle") == "no" or t.get("cycleway") in ("opposite", "opposite_lane", "opposite_track"):
        return True, True
    oneway = t.get("oneway", "yes" if t.get("junction") == "roundabout" else "no")
    if oneway in ("yes", "1", "true"):
        return True, False
    if oneway == "-1":
        return False, True
    return True, True


def way_bits(t, signed):
    """Edge attributes, as the router reads them:

    bits 0-4 way type (HIGHWAYS index, 31 for others), 5-7 track grade (0 for none),
    8 paved, 9 unpaved, 10 bike (bike lane, bike access or bicycle road),
    11 signed cycle route, 12 forward allowed, 13 backward allowed.
    Paved, unpaved and bike follow BRouter's trekking profile.
    """
    hw = t.get("highway") or t.get("route")
    s, sm = t.get("surface"), t.get("smoothness")
    paved = s in PAVED or sm in ("excellent", "good")
    unpaved = not (paved or (not s and not sm) or s in ("fine_gravel", "cobblestone") or sm in ("intermediate", "bad"))
    bike = (
        t.get("bicycle_road") == "yes"
        or t.get("cyclestreet") == "yes"
        or t.get("lcn") == "yes"
        or t.get("bicycle") in ("yes", "permissive", "designated")
        or has_bike_lane(t)
    )
    grade = {"grade1": 1, "grade2": 2, "grade3": 3, "grade4": 4, "grade5": 5}.get(t.get("tracktype"), 0)
    fwd, bwd = directions(t)
    kind = HIGHWAYS.index(hw) if hw in HIGHWAYS else OTHER_HIGHWAY
    return kind | grade << 5 | paved << 8 | unpaved << 9 | bike << 10 | signed << 11 | fwd << 12 | bwd << 13


class Ways(osmium.SimpleHandler):
    def __init__(self, signed):
        super().__init__()
        self.signed = signed
        self.ids, self.bits, self.counts = array("q"), array("I"), array("q")
        self.refs, self.lon, self.lat = array("q"), array("i"), array("i")
        self.big_counts, self.big_lon, self.big_lat = array("q"), array("i"), array("i")

    def way(self, w):
        t = w.tags
        if t.get("highway") in BIG_ROADS:
            pts = [n.location for n in w.nodes if n.location.valid()]
            self.big_counts.append(len(pts))
            for loc in pts:
                self.big_lon.append(round(loc.lon * COORD))
                self.big_lat.append(round(loc.lat * COORD))
        if not bikeable(t):
            return
        pts = [(n.ref, n.location.lon, n.location.lat) for n in w.nodes if n.location.valid()]
        if len(pts) < 2:
            return
        self.ids.append(w.id)
        self.bits.append(way_bits(t, w.id in self.signed))
        self.counts.append(len(pts))
        for ref, x, y in pts:
            self.refs.append(ref)
            self.lon.append(round(x * COORD))
            self.lat.append(round(y * COORD))


def meters(lon1, lat1, lon2, lat2):
    """Equirectangular distance in m for arrays of degrees."""
    x = np.radians(lon2 - lon1) * np.cos(np.radians((lat1 + lat2) / 2))
    return 6_371_000 * np.hypot(x, np.radians(lat2 - lat1))


def ranges(starts, counts):
    """Concatenated aranges start..start+count."""
    counts = np.asarray(counts, dtype=np.int64)
    total = int(counts.sum())
    if not total:
        return np.zeros(0, dtype=np.int64)
    offsets = np.cumsum(counts) - counts
    return np.repeat(np.asarray(starts, dtype=np.int64) - offsets, counts) + np.arange(total)


def extract(src, dem):
    """Ways of one PBF file with the elevation of each point, as numpy arrays.

    ele is smoothed along the way, for the profile. ele_raw is the DEM at the
    point, for the descent per edge.
    """
    rel = E.Relations()
    rel.apply_file(src)
    signed = {w for r in rel.resolve() for w in r["ways"]}
    h = Ways(signed)
    # Bikeable ways have a highway tag or are ferries. The filter keeps others out of Python, and node locations still work.
    h.apply_file(src, locations=True, idx="flex_mem", filters=[osmium.filter.KeyFilter("highway", "route")])
    out = {
        "ids": np.frombuffer(h.ids, dtype=np.int64).copy(),
        "bits": np.frombuffer(h.bits, dtype=np.uint32).copy(),
        "counts": np.frombuffer(h.counts, dtype=np.int64).copy(),
        "refs": np.frombuffer(h.refs, dtype=np.int64).copy(),
        "lon": np.frombuffer(h.lon, dtype=np.int32).copy(),
        "lat": np.frombuffer(h.lat, dtype=np.int32).copy(),
        "big_counts": np.frombuffer(h.big_counts, dtype=np.int64).copy(),
        "big_lon": np.frombuffer(h.big_lon, dtype=np.int32).copy(),
        "big_lat": np.frombuffer(h.big_lat, dtype=np.int32).copy(),
    }
    del h

    # A few million points at a time, in whole ways, to keep memory low.
    counts = out["counts"]
    ends = np.cumsum(counts)
    parts = {"ele": [], "ele_raw": []}
    w0 = 0
    while w0 < len(counts):
        p0 = ends[w0] - counts[w0]
        w1 = max(w0 + 1, int(np.searchsorted(ends, p0 + CHUNK_POINTS, side="right")))
        p1 = ends[w1 - 1]
        for k, v in zip(parts, profile(counts[w0:w1], out["lon"][p0:p1], out["lat"][p0:p1], dem)):
            parts[k].append(v)
        w0 = w1
    out.update({k: np.concatenate(v) if v else np.zeros(0) for k, v in parts.items()})
    return out


def profile(counts, lon, lat, dem):
    """Elevation of each point: smoothed over samples every SAMPLE_M along the way, and raw."""
    n = len(lon)
    x, y = lon / COORD, lat / COORD
    last = np.zeros(n, dtype=bool)
    last[np.cumsum(counts) - 1] = True
    seg_m = np.zeros(n)
    seg_m[:-1] = meters(x[:-1], y[:-1], x[1:], y[1:])
    seg_m[last] = 0
    # A point is the first sample of the segment to the next point.
    per_point = np.where(last, 1, np.maximum(1, np.ceil(seg_m / SAMPLE_M))).astype(np.int64)
    first_sample = np.cumsum(per_point) - per_point
    point = np.repeat(np.arange(n), per_point)
    frac = (np.arange(len(point)) - first_sample[point]) / per_point[point]
    nxt = np.minimum(point + 1, n - 1)
    raw = dem.elevations(x[point] + (x[nxt] - x[point]) * frac, y[point] + (y[nxt] - y[point]) * frac).astype(np.float64)
    del frac, nxt

    way_of_sample = np.repeat(np.repeat(np.arange(len(counts)), counts), per_point)
    samples_per_way = np.bincount(way_of_sample, minlength=len(counts))
    way_end = np.cumsum(samples_per_way) - 1
    way_start = way_end - samples_per_way + 1
    i = np.arange(len(raw))
    lo = np.maximum(i - SMOOTH, way_start[way_of_sample])
    hi = np.minimum(i + SMOOTH, way_end[way_of_sample])
    csum = np.r_[0.0, np.cumsum(raw)]
    z = (csum[hi + 1] - csum[lo]) / (hi - lo + 1)
    raw_points = raw[first_sample]
    del raw, csum, lo, hi, i

    return np.round(z[first_sample]).astype(np.int16), np.round(raw_points).astype(np.int16)


def extract_to(src, dem_dir, path):
    from dem import Dem

    save(path, extract(src, Dem(dem_dir)))


def save(path, arrays):
    """One .npy file per array in the folder path, so load() can map them."""
    tmp = path + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    for k, v in arrays.items():
        np.save(os.path.join(tmp, f"{k}.npy"), v)
    shutil.rmtree(path, ignore_errors=True)
    os.replace(tmp, path)


def load(path):
    """The arrays of save(), mapped from disk: the OS reads them as needed and can drop them again."""
    return {f[:-4]: np.load(os.path.join(path, f), mmap_mode="r") for f in os.listdir(path) if f.endswith(".npy")}


def junction_refs(path):
    """Nodes used twice or at the end of a way."""
    d = load(path)
    refs, counts = d["refs"], d["counts"]
    ends = np.r_[np.cumsum(counts) - counts, np.cumsum(counts) - 1]
    s = np.sort(refs)
    twice = np.unique(s[1:][s[1:] == s[:-1]])
    del s
    return np.union1d(twice, refs[ends])


def edges(path, junctions, grids):
    """Edges of all ways. Ends are OSM node ids."""
    d = load(path)
    counts, bits = d["counts"], d["bits"]
    points = [d[k] for k in ("refs", "lon", "lat", "ele", "ele_raw")]
    del d
    # In chunks of whole ways, to keep the temporary arrays small. Edges never span ways.
    parts, w, p = [], 0, 0
    ends = np.cumsum(counts)
    while w < len(counts):
        w_end = max(w + 1, int(np.searchsorted(ends, p + CHUNK_POINTS, side="right")))
        p_end = int(ends[w_end - 1])
        parts.append(chunk_edges(counts[w:w_end], bits[w:w_end], *(a[p:p_end] for a in points), junctions, grids))
        w, p = w_end, p_end
    shape_offset = np.cumsum([0] + [len(c["shape_lon"]) for c in parts])
    for c, off in zip(parts, shape_offset):
        c["shape_start"] = c["shape_start"] + off
    out = {k: np.concatenate([c.pop(k) for c in parts]) for k in list(parts[0])}
    out["node_ref"], once = np.unique(out["node_ref"], return_index=True)
    out["node_lon"], out["node_lat"] = out["node_lon"][once], out["node_lat"][once]
    return out


def chunk_edges(counts, bits, refs, lon, lat, ele, ele_raw, junctions, grids):
    n = len(refs)
    first, last = np.cumsum(counts) - counts, np.cumsum(counts) - 1
    way_of_point = np.repeat(np.arange(len(counts)), counts)
    at = np.minimum(np.searchsorted(junctions, refs), len(junctions) - 1)
    junction = junctions[at] == refs
    junction[first] = junction[last] = True

    j = np.nonzero(junction)[0]
    same_way = way_of_point[j[:-1]] == way_of_point[j[1:]]
    s, e = j[:-1][same_way], j[1:][same_way]
    x, y = lon / COORD, lat / COORD
    seg_m = np.zeros(n)
    seg_m[:-1] = meters(x[:-1], y[:-1], x[1:], y[1:])
    seg_m[last] = 0
    cum_m = np.r_[0.0, np.cumsum(seg_m)]
    length = cum_m[e] - cum_m[s]
    down_f = np.maximum(0, descent(ele_raw, s, e) - DOWNHILL_CUTOFF * length)
    down_b = np.maximum(0, descent(ele_raw, e, s) - DOWNHILL_CUTOFF * length)
    edge_bits = bits[way_of_point[s]]
    est = grids.estimates(x, y, seg_m, s, e, edge_bits & 31)

    # Shape points: inner points off the line of their neighbors.
    inner = ~junction
    inner[first] = inner[last] = False
    prev, nxt = np.maximum(np.arange(n) - 1, 0), np.minimum(np.arange(n) + 1, n - 1)
    scale = np.cos(np.radians(y)) * 111_320
    ax, ay = (x[prev] - x) * scale, (y[prev] - y) * 110_540
    bx, by = (x[nxt] - x) * scale, (y[nxt] - y) * 110_540
    offset = np.abs(ax * by - ay * bx) / np.maximum(np.hypot(bx - ax, by - ay), 1e-9)
    shape = inner & (offset >= SIMPLIFY_M)
    shape_before = np.r_[0, np.cumsum(shape)]
    kept = np.nonzero(shape)[0]
    node_ref, once = np.unique(refs[j], return_index=True)

    return {
        "from": refs[s],
        "to": refs[e],
        "len": np.maximum(1, np.round(length)).astype(np.uint32),
        "bits": edge_bits.astype(np.uint16),
        "est": est,
        "down_f": np.minimum(np.round(down_f * 10), 65535).astype(np.uint16),
        "down_b": np.minimum(np.round(down_b * 10), 65535).astype(np.uint16),
        "ele_from": ele[s],
        "ele_to": ele[e],
        "shape_start": shape_before[s + 1],
        "shape_count": (shape_before[e] - shape_before[s + 1]).astype(np.int32),
        "shape_lon": lon[kept],
        "shape_lat": lat[kept],
        "shape_ele": ele[kept],
        "node_ref": node_ref,
        "node_lon": lon[j][once],
        "node_lat": lat[j][once],
    }


def descent(z, start, end):
    """Meters of descent from point start to point end of each edge, with a
    HYSTERESIS_M dead band against DEM noise. All edges at once, one point
    position per step."""
    z = z.astype(np.float64)
    step = np.where(end >= start, 1, -1)
    ref = z[start].copy()
    total = np.zeros(len(start))
    pos = start + step
    active = np.nonzero(pos != end + step)[0]
    while len(active):
        v = z[pos[active]]
        r = ref[active]
        down = v < r - HYSTERESIS_M
        total[active[down]] += r[down] - HYSTERESIS_M - v[down]
        ref[active] = np.where(down, v + HYSTERESIS_M, np.maximum(r, v))
        pos[active] += step[active]
        active = active[pos[active] != end[active] + step[active]]
    return total


def share_class(v):
    """0 for none, 1-6 by sixths."""
    return np.ceil(np.clip(v, 0, 1) * 6).astype(np.uint16)


class Grids:
    """Forest, water, noise and town around the ways, for the estimates per edge.

    Forest and water come from the scenery layers, with their buffers. Noise is
    the big roads plus NOISE_CELLS. Town is the km of town streets per km²."""

    def __init__(self, d, scenery_path):
        import scenery as S

        self.S = S
        layers = S.Scenery(*S.merge([S.load(scenery_path)])).layers
        self.layers = {"forest": layers["forest"], "water": layers["water"]}
        noise = np.zeros((S.HEIGHT, S.WIDTH), dtype=bool)
        counts, lon, lat = d["big_counts"], (d["big_lon"] / COORD).tolist(), (d["big_lat"] / COORD).tolist()
        ends = np.cumsum(counts).tolist()
        for a, b in zip((np.cumsum(counts) - counts).tolist(), ends):
            S.draw(noise, [list(zip(lon[a:b], lat[a:b]))], line=True)
        for i in range(NOISE_CELLS):
            noise = S.dilate(noise, square=i % 2 == 1)
        self.layers["noise"] = S.pack(noise)
        del noise
        self.town = self.town_density(d)

    def town_density(self, d):
        S = self.S
        counts, kind = d["counts"], d["bits"] & 31
        town = np.isin(kind, [HIGHWAYS.index(h) for h in TOWN_ROADS])
        pts = ranges((np.cumsum(counts) - counts)[town], counts[town])
        x, y = d["lon"][pts] / COORD, d["lat"][pts] / COORD
        last = np.zeros(len(pts), dtype=bool)
        last[np.cumsum(counts[town]) - 1] = True
        seg_m = np.where(last[:-1], 0, meters(x[:-1], y[:-1], x[1:], y[1:]))
        cx, cy = self.cells((x[:-1] + x[1:]) / 2, (y[:-1] + y[1:]) / 2, TOWN_CELLS)
        h, w = -(-S.HEIGHT // TOWN_CELLS), -(-S.WIDTH // TOWN_CELLS)
        ok = (cx >= 0) & (cx < w) & (cy >= 0) & (cy < h)
        km = np.bincount(cy[ok] * w + cx[ok], weights=seg_m[ok] / 1000, minlength=h * w).reshape(h, w)
        p = np.pad(km, 1)
        around = sum(p[1 + dy : h + 1 + dy, 1 + dx : w + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        cell_km2 = TOWN_CELLS * S.CELL_LON * 111.32 * np.cos(np.radians(51)) * TOWN_CELLS * S.CELL_LAT * 110.54
        return around / (9 * cell_km2)

    def cells(self, lon, lat, size=1):
        S = self.S
        return (
            np.floor((lon - S.WEST) / (S.CELL_LON * size)).astype(np.int64),
            np.floor((S.NORTH - lat) / (S.CELL_LAT * size)).astype(np.int64),
        )

    def sample(self, lon, lat):
        """Value of each grid at each point: 1 or 0 on the layers, km per km² for town."""
        S = self.S
        x, y = self.cells(lon, lat)
        ok = (x >= 0) & (x < S.WIDTH) & (y >= 0) & (y < S.HEIGHT)
        x, y = np.where(ok, x, 0), np.where(ok, y, 0)
        out = {k: ((a[y, x >> 3] >> (7 - (x & 7))) & 1) * ok for k, a in self.layers.items()}
        tx, ty = x // TOWN_CELLS, y // TOWN_CELLS
        out["town"] = self.town[ty, tx] * ok
        return out

    def estimates(self, x, y, seg_m, s, e, kind):
        """Estimate classes per edge, packed: forest bits 0-2, water 3-5, town 6-8,
        traffic 9-11, noise 12-14. Averaged over samples every SAMPLE_M."""
        n = len(x)
        per = np.where(seg_m > 0, np.maximum(1, np.ceil(seg_m / SAMPLE_M)), 0).astype(np.int64)
        point = np.repeat(np.arange(n), per)
        first = np.cumsum(per) - per
        frac = (np.arange(len(point)) - first[point] + 0.5) / per[point]
        nxt = np.minimum(point + 1, n - 1)
        values = self.sample(x[point] + (x[nxt] - x[point]) * frac, y[point] + (y[nxt] - y[point]) * frac)
        before = np.r_[0, np.cumsum(per)]
        samples = np.maximum(before[e] - before[s], 1)
        mean = {}
        for k, v in values.items():
            total = np.r_[0.0, np.cumsum(np.bincount(point, weights=v, minlength=n))]
            mean[k] = (total[e] - total[s]) / samples
        town = np.searchsorted(TOWN_KM, mean["town"], side="right").astype(np.uint16)
        base = np.zeros(32, dtype=np.uint16)
        for h, c in TRAFFIC.items():
            base[HIGHWAYS.index(h)] = c
        traffic = base[kind]
        traffic = np.minimum(6, traffic + ((traffic > 0) & (town >= 3))).astype(np.uint16)
        return (
            share_class(mean["forest"])
            | share_class(mean["water"]) << 3
            | town << 6
            | traffic << 9
            | share_class(mean["noise"]) << 12
        ).astype(np.uint16)


def main_component(a, b, n):
    """Mask of the nodes in the largest connected part.

    Each round hangs the larger label of each edge under the smaller one, then
    follows the labels to their roots. A handful of rounds is enough."""
    label = np.arange(n, dtype=np.int32)
    while True:
        la, lb = label[a], label[b]
        differ = la != lb
        if not differ.any():
            break
        hi, lo = np.maximum(la, lb)[differ], np.minimum(la, lb)[differ]
        order = np.lexsort((lo, hi))
        hi, lo = hi[order], lo[order]
        first = np.r_[True, hi[1:] != hi[:-1]]
        label[hi[first]] = np.minimum(label[hi[first]], lo[first])
        while True:
            root = label[label]
            if np.array_equal(root, label):
                break
            label = root
    ids, sizes = np.unique(label, return_counts=True)
    return label == ids[np.argmax(sizes)]


def tile_of(lon, lat):
    return np.floor(lon / COORD / TILE_DEG).astype(np.int64), np.floor(lat / COORD / TILE_DEG).astype(np.int64)


def build(path, scenery_path, out, graph_path):
    """Write <out>/route/<key>.bin and <key>.geo.bin. Returns the manifest entry and stats.

    Also saves the graph to graph_path, for route_pairs()."""
    grids = Grids(load(path), scenery_path)
    e = edges(path, junction_refs(path), grids)
    del grids

    # Dense node numbers. Loops are dropped, and so is everything off the largest connected part.
    # Edge ends are all in node_ref, which is sorted.
    refs = e.pop("node_ref")
    e_from = np.searchsorted(refs, e.pop("from")).astype(np.int32)
    e_to = np.searchsorted(refs, e.pop("to")).astype(np.int32)
    node_lon, node_lat = e.pop("node_lon"), e.pop("node_lat")
    del refs
    keep = e_from != e_to
    main = main_component(e_from[keep], e_to[keep], len(node_lon))
    keep &= main[e_from]
    edge_keys = ("len", "bits", "est", "down_f", "down_b", "ele_from", "ele_to", "shape_start", "shape_count")
    edge = {k: e[k][keep] for k in edge_keys}
    shape = {k: e[k] for k in ("shape_lon", "shape_lat", "shape_ele")}
    e_from, e_to = e_from[keep], e_to[keep]
    del e, keep, main

    # Node ids in tile order, so a tile's nodes have nearby ids.
    used = np.zeros(len(node_lon), dtype=bool)
    used[e_from] = used[e_to] = True
    tx, ty = tile_of(node_lon, node_lat)
    order = np.lexsort((node_lat, node_lon, ty, tx))
    order = order[used[order]]
    new_id = np.full(len(node_lon), -1, dtype=np.int32)
    new_id[order] = np.arange(len(order), dtype=np.int32)
    e_from, e_to = new_id[e_from], new_id[e_to]
    node_lon, node_lat, tx, ty = node_lon[order], node_lat[order], tx[order], ty[order]
    del used, order, new_id

    # Each edge goes into the tile of each end.
    key = tx * 100_000 + ty
    e_tile = np.concatenate([key[e_from], key[e_to]])
    e_index = np.tile(np.arange(len(e_from)), 2)
    pick = np.r_[np.ones(len(e_from), dtype=bool), key[e_to] != key[e_from]]
    e_tile, e_index = e_tile[pick], e_index[pick]
    order = np.lexsort((e_index, e_from[e_index], e_tile))
    e_tile, e_index = e_tile[order], e_index[order]
    tiles, starts = np.unique(e_tile, return_index=True)

    folder = os.path.join(out, "route")
    os.makedirs(folder, exist_ok=True)
    keys, sizes = [], []
    # zlib frees the GIL, so threads compress in parallel. Few pending tiles keep memory low.
    pool = ThreadPoolExecutor()
    pending = deque()
    for k, idx in zip(tiles.tolist(), np.split(e_index, starts[1:])):
        name = f"{k // 100_000}_{k % 100_000}"
        nodes = np.unique(np.concatenate([e_from[idx], e_to[idx]]))
        search = b"".join([
            SEARCH_MAGIC,
            np.array([len(nodes), len(idx)], dtype="<u4").tobytes(),
            delta(nodes),
            delta(node_lon[nodes]),
            delta(node_lat[nodes]),
            delta(np.searchsorted(nodes, e_from[idx])),
            np.searchsorted(nodes, e_to[idx]).astype("<i4").tobytes(),
            edge["len"][idx].astype("<u4").tobytes(),
            edge["bits"][idx].astype("<u2").tobytes(),
            edge["down_f"][idx].astype("<u2").tobytes(),
            edge["down_b"][idx].astype("<u2").tobytes(),
            edge["est"][idx].astype("<u2").tobytes(),
        ])  # fmt: skip
        geometry = geometry_part(idx, edge, shape, node_lon[e_from[idx]], node_lat[e_from[idx]])
        keys.append(name)
        pending.append((
            pool.submit(write_gz, os.path.join(folder, f"{name}.bin"), search),
            pool.submit(write_gz, os.path.join(folder, f"{name}.geo.bin"), geometry),
        ))  # fmt: skip
        while len(pending) > 32:
            sizes.append(tuple(f.result() for f in pending.popleft()))
    sizes += [tuple(f.result() for f in p) for p in pending]
    pool.shutdown()
    save(graph_path, {
        "node_lon": node_lon, "node_lat": node_lat, "from": e_from, "to": e_to,
        "len": edge["len"], "bits": edge["bits"], "shape_start": edge["shape_start"], "shape_count": edge["shape_count"],
        "shape_lon": shape["shape_lon"], "shape_lat": shape["shape_lat"],
    })  # fmt: skip

    manifest = {
        "format": FORMAT,
        "size": TILE_DEG,
        "path": "route/{key}.bin",
        "geometry": "route/{key}.geo.bin",
        "keys": sorted(keys),
        "highways": HIGHWAYS,
    }
    stats = {
        "nodes": len(node_lon),
        "edges": len(e_from),
        "km": round(float(edge["len"].sum()) / 1000),
        "tiles": len(keys),
        "search_mib": round(sum(s for s, _ in sizes) / 2**20, 1),
        "geometry_mib": round(sum(g for _, g in sizes) / 2**20, 1),
        "max_tile_mib": round(max(s + g for s, g in sizes) / 2**20, 2),
        # Share of km in each class 0-6.
        **{
            k: np.round(np.bincount((edge["est"] >> shift) & 7, weights=edge["len"], minlength=7) / edge["len"].sum(), 3).tolist()
            for k, shift in (("forest", 0), ("water", 3), ("town", 6), ("traffic", 9), ("noise", 12))
        },
    }
    return manifest, stats


def geometry_part(idx, edge, shape, from_lon, from_lat):
    """Shape points as deltas from the point before (the from node first), and
    elevation at the from node, each shape point and the to node."""
    count = edge["shape_count"][idx]
    pts = ranges(edge["shape_start"][idx], count)
    lon, lat = shape["shape_lon"][pts].astype(np.int64), shape["shape_lat"][pts].astype(np.int64)
    first = (np.cumsum(count) - count)[count > 0]
    prev_lon, prev_lat = np.r_[0, lon[:-1]], np.r_[0, lat[:-1]]
    prev_lon[first], prev_lat[first] = from_lon[count > 0], from_lat[count > 0]
    ele_count = count + 2
    ele_first = np.cumsum(ele_count) - ele_count
    ele = np.empty(int(ele_count.sum()), dtype=np.int16)
    ele[ele_first] = edge["ele_from"][idx]
    ele[ele_first + ele_count - 1] = edge["ele_to"][idx]
    ele[ranges(ele_first + 1, count)] = shape["shape_ele"][pts]
    return b"".join([
        GEOMETRY_MAGIC,
        np.array([len(idx), len(pts)], dtype="<u4").tobytes(),
        (lon - prev_lon).astype("<i4").tobytes(),
        (lat - prev_lat).astype("<i4").tobytes(),
        count.astype("<u2").tobytes(),
        ele.astype("<i2").tobytes(),
    ])  # fmt: skip


def delta(a):
    """Int32 deltas, the first value as is."""
    return np.diff(np.asarray(a, dtype=np.int64), prepend=0).astype("<i4").tobytes()


def write_gz(path, data):
    with open(path, "wb") as f:
        f.write(gzip.compress(data, 9, mtime=0))
    return os.path.getsize(path)


# --- connectors of the route network (graph.py) ------------------------------

CONNECTOR_SNAP_KM = 0.3  # a connector end moves to a routing node this close
CONNECTOR_REACH = 4  # gives up beyond this × the straight line, at least 2 km of cost
MAIN_ROADS = {
    "trunk": (1.5, 10), "trunk_link": (1.5, 10), "primary": (1.2, 3), "primary_link": (1.2, 3),
    "secondary": (1.1, 1.6), "secondary_link": (1.1, 1.6), "tertiary": (1, 1.4), "tertiary_link": (1, 1.4),
    "unclassified": (1, 1.3),
}  # fmt: skip
GOOD_MINOR = [1, 1, 1.1, 1.5, 2, 3]
POOR_MINOR = [5, 1.3, 2, 3, 5, 5]


def touring_factor(bits):
    """Cost per meter with the touring costs of packages/router/src/cost.ts, without downhill and turns."""
    hw = HIGHWAYS[bits & 31] if (bits & 31) < len(HIGHWAYS) else None
    grade, paved, unpaved, bike, signed = (bits >> 5) & 7, (bits >> 8) & 1, (bits >> 9) & 1, (bits >> 10) & 1, (bits >> 11) & 1
    if hw == "ferry":
        return 5.67
    if signed:
        return 1
    if hw == "pedestrian":
        f = 2.2 if bike else 3
    elif hw == "bridleway":
        f = 5
    elif hw == "cycleway":
        f = 1
    elif hw in ("residential", "living_street"):
        f = 1.5 if unpaved else 1.1
    elif hw == "service":
        f = 1.6 if unpaved else 1.3
    elif hw in ("track", "road", "path", "footway"):
        good = paved and (bike or hw == "footway") and not unpaved
        f = (GOOD_MINOR if good else POOR_MINOR)[min(grade, 5)]
    else:
        road = MAIN_ROADS.get(hw)
        f = (0 if bike else 2) + (road[0 if bike else 1] if road else 2)
    return f + 0.05


def surface_of(bits):
    """Surface class of graph.py for an edge."""
    hw = HIGHWAYS[bits & 31] if (bits & 31) < len(HIGHWAYS) else None
    grade, paved, unpaved = (bits >> 5) & 7, (bits >> 8) & 1, (bits >> 9) & 1
    if paved or grade == 1:
        return "paved"
    if unpaved or grade >= 4:
        return "rough"
    if grade:
        return "gravel"
    if hw == "track":
        return "gravel"
    if hw in BIKE_ROADS:
        return "paved"
    return "unknown"


def route_pairs(graph_path, pairs):
    """Cheapest way between each pair of [lon, lat] points on the graph of build().

    Returns per pair {"km", "coords", "surface"}, or None if there is no way close enough."""
    import graph as G

    g = load(graph_path)
    # Kept small for Germany: coordinates stay on disk, costs are float32, adjacency int32.
    node_lon, node_lat = g["node_lon"], g["node_lat"]
    n = len(node_lon)
    length, bits, e_from, e_to = g["len"], g["bits"], g["from"], g["to"]
    m = len(e_from)
    kinds, inverse = np.unique(bits, return_inverse=True)
    cost = (np.array([touring_factor(int(b)) for b in kinds], dtype=np.float32)[inverse] * length).astype(np.float32)
    del inverse
    order = np.argsort(np.concatenate([e_from, e_to]), kind="stable")
    other = np.concatenate([e_to, e_from])[order].astype(np.int32)
    seg = (order % m).astype(np.int32)
    del order
    offsets = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(np.bincount(e_from, minlength=n) + np.bincount(e_to, minlength=n), out=offsets[1:])
    s_start, s_count, s_lon, s_lat = g["shape_start"], g["shape_count"], g["shape_lon"], g["shape_lat"]

    def xy(v):
        return [int(node_lon[v]) / COORD, int(node_lat[v]) / COORD]

    # Only nodes near a connector end can be snapped to.
    cell = G.NodeGrid.CELL
    reach = int(CONNECTOR_SNAP_KM / 111 / cell * 2) + 1
    wanted = set()
    for p in (x for pair in pairs for x in pair):
        cx, cy = math.floor(p[0] / cell), math.floor(p[1] / cell)
        wanted.update((cx + dx) * 2**20 + cy + dy for dx in range(-reach, reach + 1) for dy in range(-reach, reach + 1))
    cells = np.floor(node_lon / COORD / cell).astype(np.int64) * 2**20 + np.floor(node_lat / COORD / cell).astype(np.int64)
    near_rows = np.nonzero(np.isin(cells, np.fromiter(wanted, np.int64, len(wanted))))[0]
    del cells
    grid = G.NodeGrid(np.column_stack([node_lon[near_rows] / COORD, node_lat[near_rows] / COORD]))

    def nearest(p):
        d, rows = grid.near(p, CONNECTOR_SNAP_KM)
        return (float(d[0]), int(near_rows[rows[0]])) if len(rows) else None

    def search(s, t, limit):
        target = xy(t)
        h = lambda v: G.dist_km(xy(v), target) * 1000  # noqa: E731
        best, via = {s: 0.0}, {}
        heap = [(h(s), s)]
        done = set()
        while heap:
            _, u = heapq.heappop(heap)
            if u in done:
                continue
            if u == t:
                break
            done.add(u)
            for slot in range(int(offsets[u]), int(offsets[u + 1])):
                v, e = int(other[slot]), int(seg[slot])
                c = best[u] + float(cost[e])
                if c <= limit and c < best.get(v, math.inf):
                    best[v], via[v] = c, (u, e)
                    heapq.heappush(heap, (c + h(v), v))
        if t not in best:
            return None
        steps = []
        while t != s:
            u, e = via[t]
            steps.append((u, e))
            t = u
        return steps[::-1]

    out = []
    for p, q in pairs:
        a, b = nearest(p), nearest(q)
        if not a or not b:
            out.append(None)
            continue
        straight = G.dist_km(p, q) * 1000
        steps = search(a[1], b[1], max(2000, CONNECTOR_REACH * straight))
        if steps is None:
            out.append(None)
            continue
        coords, dist = [list(p)], (a[0] + b[0]) * 1000
        by_surface = {}
        for u, e in steps:
            i, k = int(s_start[e]), int(s_count[e])
            pts = list(zip((s_lon[i : i + k] / COORD).tolist(), (s_lat[i : i + k] / COORD).tolist()))
            if int(e_from[e]) != u:
                pts.reverse()
            coords += [xy(u), *map(list, pts)]
            dist += float(length[e])
            s = surface_of(int(bits[e]))
            by_surface[s] = by_surface.get(s, 0) + float(length[e])
        coords += [xy(b[1]), list(q)]
        coords = [c for i, c in enumerate(coords) if i == 0 or c != coords[i - 1]]
        out.append({"km": dist / 1000, "coords": coords, "surface": max(by_surface, key=by_surface.get, default="unknown")})
    return out
