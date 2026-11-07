"""Routing tiles: all bikeable ways, for the router in the browser.

extract() reads one state: the ways and the elevation of each point. build() merges the states, splits the ways at
junctions, keeps the largest connected part and writes two gzipped files per
tile: the search part (nodes and edges) and the geometry part (shape points
and elevation). The format is in the README.
"""

import gzip
import os
from array import array

import numpy as np
import osmium

import extract as E

TILE_DEG = 0.25
FORMAT = 1
SEARCH_MAGIC = b"WRT1"
GEOMETRY_MAGIC = b"WRG1"
COORD = 1e6  # coordinates as int degrees x 1e6

# Way types in the order of their index in the edge attributes.
HIGHWAYS = [
    "cycleway", "living_street", "residential", "unclassified", "service", "road", "track", "path", "footway",
    "pedestrian", "bridleway", "tertiary", "tertiary_link", "secondary", "secondary_link", "primary",
    "primary_link", "trunk", "trunk_link",
]  # fmt: skip
OTHER_HIGHWAY = 31
BIKE_ROADS = {
    "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
    "unclassified", "residential", "living_street", "service", "road", "cycleway", "track", "path",
}  # fmt: skip
PAVED = {"paved", "asphalt", "concrete", "paving_stones", "sett"}

SAMPLE_M = 50  # DEM sample spacing
SMOOTH = 4  # samples on each side, to damp DSM noise
DOWNHILL_CUTOFF = 0.015  # gradients below this don't count, like BRouter's downhillcutoff
HYSTERESIS_M = 10  # dead band for the descent per edge
SIMPLIFY_M = 1.5  # an inner point closer than this to the line of its neighbors is dropped
CHUNK_POINTS = 2_000_000  # points per profile() call


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
    hw = t.get("highway")
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

    def way(self, w):
        t = w.tags
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
    h.apply_file(src, locations=True, idx="flex_mem")
    out = {
        "ids": np.frombuffer(h.ids, dtype=np.int64).copy(),
        "bits": np.frombuffer(h.bits, dtype=np.uint32).copy(),
        "counts": np.frombuffer(h.counts, dtype=np.int64).copy(),
        "refs": np.frombuffer(h.refs, dtype=np.int64).copy(),
        "lon": np.frombuffer(h.lon, dtype=np.int32).copy(),
        "lat": np.frombuffer(h.lat, dtype=np.int32).copy(),
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

    np.savez(path, **extract(src, Dem(dem_dir)))


def junction_refs(path):
    """Nodes used twice or at the end of a way. Every way through a node is in
    the extract of the node's state, so the union over the states is exact."""
    d = np.load(path)
    refs, counts = d["refs"], d["counts"]
    ends = np.r_[np.cumsum(counts) - counts, np.cumsum(counts) - 1]
    uniq, uses = np.unique(refs, return_counts=True)
    return np.union1d(uniq[uses > 1], refs[ends])


def state_edges(path, keep, junctions):
    """Edges of the kept ways of one state. Ends are OSM node ids."""
    d = np.load(path)
    counts = d["counts"]
    keep_points = np.repeat(keep, counts)
    counts, bits = counts[keep], d["bits"][keep]
    refs, lon, lat, ele, ele_raw = (d[k][keep_points] for k in ("refs", "lon", "lat", "ele", "ele_raw"))
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

    return {
        "from": refs[s],
        "to": refs[e],
        "len": np.maximum(1, np.round(length)).astype(np.uint32),
        "bits": bits[way_of_point[s]].astype(np.uint16),
        "down_f": np.minimum(np.round(down_f * 10), 65535).astype(np.uint16),
        "down_b": np.minimum(np.round(down_b * 10), 65535).astype(np.uint16),
        "ele_from": ele[s],
        "ele_to": ele[e],
        "shape_start": shape_before[s + 1],
        "shape_count": (shape_before[e] - shape_before[s + 1]).astype(np.int64),
        "shape_lon": lon[kept],
        "shape_lat": lat[kept],
        "shape_ele": ele[kept],
        "node_ref": refs[j],
        "node_lon": lon[j],
        "node_lat": lat[j],
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


def main_component(a, b, n):
    """Mask of the nodes in the largest connected part. Min-label propagation with pointer jumping."""
    label = np.arange(n)
    while True:
        m = np.minimum(label[a], label[b])
        new = label.copy()
        np.minimum.at(new, a, m)
        np.minimum.at(new, b, m)
        new = new[new]
        if np.array_equal(new, label):
            break
        label = new
    ids, sizes = np.unique(label, return_counts=True)
    return label == ids[np.argmax(sizes)]


def tile_of(lon, lat):
    return np.floor(lon / COORD / TILE_DEG).astype(np.int64), np.floor(lat / COORD / TILE_DEG).astype(np.int64)


def build(paths, out):
    """Write <out>/route/<key>.bin and <key>.geo.bin. Returns the manifest entry and stats."""
    # A way in two state extracts belongs to the first.
    ids = [np.load(p)["ids"] for p in paths]
    _, first = np.unique(np.concatenate(ids), return_index=True)
    owned = np.zeros(sum(len(i) for i in ids), dtype=bool)
    owned[first] = True
    bounds = np.cumsum([0] + [len(i) for i in ids])
    del ids, first

    junctions = np.unique(np.concatenate([junction_refs(p) for p in paths]))
    parts = [state_edges(p, owned[bounds[i] : bounds[i + 1]], junctions) for i, p in enumerate(paths)]
    del junctions, owned
    shape_offset = np.cumsum([0] + [len(p["shape_lon"]) for p in parts])
    for p, off in zip(parts, shape_offset):
        p["shape_start"] = p["shape_start"] + off
    e = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
    del parts

    # Dense node numbers. Loops are dropped, and so is everything off the largest connected part.
    refs, inverse = np.unique(np.concatenate([e["from"], e["to"]]), return_inverse=True)
    n_edges = len(e["from"])
    e_from, e_to = inverse[:n_edges], inverse[n_edges:]
    at = np.searchsorted(refs, e["node_ref"])
    node_lon = np.zeros(len(refs), dtype=np.int32)
    node_lat = np.zeros(len(refs), dtype=np.int32)
    node_lon[at], node_lat[at] = e["node_lon"], e["node_lat"]
    del inverse, at, refs
    keep = e_from != e_to
    main = main_component(e_from[keep], e_to[keep], len(node_lon))
    keep &= main[e_from]
    edge_keys = ("len", "bits", "down_f", "down_b", "ele_from", "ele_to", "shape_start", "shape_count")
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
    new_id = np.full(len(node_lon), -1, dtype=np.int64)
    new_id[order] = np.arange(len(order))
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
        ])  # fmt: skip
        geometry = geometry_part(idx, edge, shape, node_lon[e_from[idx]], node_lat[e_from[idx]])
        keys.append(name)
        sizes.append((write_gz(os.path.join(folder, f"{name}.bin"), search), write_gz(os.path.join(folder, f"{name}.geo.bin"), geometry)))

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
