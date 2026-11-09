"""Named areas for the Where step: the official tourism regions (Reisegebiete).

Usage: python areas.py <data_dir> [--cache DIR]

Reads RG250 from the BKG GE250 download (ETRS89 / UTM 32N shapefile),
simplifies the outlines, and finds the stations and signed routes in each
area. Writes <data_dir>/areas.json and adds it to manifest.json. Needs
route-stations.json for the routes.

Neighbours share their borders: each border between two junctions is
simplified once, so the simplified areas still fit together.
"""

import argparse
import datetime
import gzip
import json
import math
import os
import struct
import sys
import zipfile

import numpy as np

import export as X
import lines as L

HERE = os.path.dirname(os.path.abspath(__file__))
LAYER = "ge250/ge250/rg/RG250"
CREDIT = "© BKG ({year}) dl-de/by-2-0, outlines simplified. Sources: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_ge250.pdf"
TOLERANCE_M = 100
# Islands smaller than this are left out, unless it is the area's only land.
MIN_RING_KM2 = 1.0
# A route counts for an area with at least this many km in it.
ROUTE_MIN_KM = 10
ROUTE_STEP_KM = 0.5
# Stations at the border or coast that the simplified outline misses.
STATION_NEAR_KM = 2.0

# Display names where the official one is long, unclear or written oddly.
SHORT = {
    "A10": "Elbe-Elster-Land",
    "B05": "Mecklenburgische Seenplatte",
    "C00": "Dresden",
    "C02": "Leipzig",
    "C03": "Oberlausitz",
    "C14": "Chemnitz-Zwickau",
    "D02": "Saale-Unstrut",
    "D04": "Elbe-Börde-Heide",
    "E40": "Wartburg-Hainich",
    "F04": "Schleswig-Holstein",
    "G07": "Emsland und Osnabrücker Land",
    "H01": "Eifel und Aachen",
    "H08": "Bonn und Rhein-Sieg",
    "H09": "Köln und Rhein-Erft",
    "H10": "Düsseldorf",
    "I01": "Kassel Land",
    "I03": "Werra-Meißner-Land",
    "I06": "Waldhessen",
    "I11": "Rhön (Hessen)",
    "I12": "Spessart-Kinzigtal",
    "I15": "Odenwald",
    "K03": "Saarland",
    "T01": "Altmühltal",
    "T10": "Rhön (Bayern)",
    "T11": "Romantisches Franken",
    "T23": "München",
    "T27": "Starnberg Ammersee",
    "T31": "Tegernsee Schliersee",
    "T42": "Obermain-Jura",
    "T43": "Coburg-Rennsteig",
}


# --- Reading the shapefile ---


def read_dbf(data):
    """Records of a dBASE file as dicts of stripped strings (UTF-8)."""
    n, header, size = struct.unpack("<4xIHH", data[:12])
    fields, o = [], 32
    while data[o] != 0x0D:
        fields.append((data[o : o + 11].split(b"\0")[0].decode(), data[o + 16]))
        o += 32
    out = []
    for i in range(n):
        o = header + i * size + 1
        rec = {}
        for name, length in fields:
            rec[name] = data[o : o + length].decode("utf-8").strip()
            o += length
        out.append(rec)
    return out


def read_shp(data):
    """Polygon shapes: per record a list of rings, each an (n, 2) array without the closing point."""
    shapes, o = [], 100
    while o < len(data):
        length = struct.unpack(">I", data[o + 4 : o + 8])[0] * 2
        rec = data[o + 8 : o + 8 + length]
        o += 8 + length
        kind = struct.unpack("<i", rec[:4])[0]
        if kind == 0:
            shapes.append([])
            continue
        if kind != 5:
            raise ValueError(f"shape type {kind}, expected polygons")
        parts, points = struct.unpack("<ii", rec[36:44])
        starts = list(struct.unpack(f"<{parts}i", rec[44 : 44 + 4 * parts])) + [points]
        xy = np.frombuffer(rec, "<f8", points * 2, 44 + 4 * parts).reshape(-1, 2)
        shapes.append([xy[a : b - 1] for a, b in zip(starts, starts[1:])])
    return shapes


def read_layer(zip_path, layer=LAYER):
    with zipfile.ZipFile(zip_path) as zf:
        recs = read_dbf(zf.read(layer + ".dbf"))
        shapes = read_shp(zf.read(layer + ".shp"))
    return list(zip(recs, shapes))


# --- Geometry ---

# GRS80, UTM zone 32N
A_AXIS, F = 6378137.0, 1 / 298.257222101
K0, E0, LON0 = 0.9996, 500000.0, 9.0


def utm_to_lonlat(xy):
    """ETRS89 / UTM 32N to [lon, lat] in degrees. Krüger series, well under 1 m."""
    n = F / (2 - F)
    a = A_AXIS / (1 + n) * (1 + n * n / 4 + n**4 / 64)
    beta = (n / 2 - 2 * n * n / 3 + 37 * n**3 / 96, n * n / 48 + n**3 / 15, 17 * n**3 / 480)
    delta = (2 * n - 2 * n * n / 3 - 2 * n**3, 7 * n * n / 3 - 8 * n**3 / 5, 56 * n**3 / 15)
    xi = xy[:, 1] / (K0 * a)
    eta = (xy[:, 0] - E0) / (K0 * a)
    xi1, eta1 = xi.copy(), eta.copy()
    for j, b in enumerate(beta, 1):
        xi1 -= b * np.sin(2 * j * xi) * np.cosh(2 * j * eta)
        eta1 -= b * np.cos(2 * j * xi) * np.sinh(2 * j * eta)
    chi = np.arcsin(np.sin(xi1) / np.cosh(eta1))
    lat = chi + sum(d * np.sin(2 * j * chi) for j, d in enumerate(delta, 1))
    lon = math.radians(LON0) + np.arctan2(np.sinh(eta1), np.cos(xi1))
    return np.column_stack([np.degrees(lon), np.degrees(lat)])


def ring_area(r):
    """Signed area, positive counter-clockwise."""
    x, y = r[:, 0], r[:, 1]
    return (np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y)) / 2


def douglas_peucker(pts, tol):
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        seg = pts[i + 1 : j]
        d = pts[j] - pts[i]
        norm = math.hypot(*d)
        if norm == 0:
            dist = np.hypot(*(seg - pts[i]).T)
        else:
            dist = np.abs(d[0] * (seg[:, 1] - pts[i][1]) - d[1] * (seg[:, 0] - pts[i][0])) / norm
        k = int(np.argmax(dist))
        if dist[k] > tol:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return pts[keep]


def simplify_rings(rings, tol):
    """Simplify rings that share borders, so shared borders stay identical.

    A junction is a point with more or fewer than two neighbours over all rings.
    Each chain between junctions is simplified once, the same way from both sides.
    """
    keys = [[(float(x), float(y)) for x, y in r] for r in rings]
    nbrs = {}
    for k in keys:
        for i, p in enumerate(k):
            s = nbrs.setdefault(p, set())
            s.add(k[i - 1])
            s.add(k[(i + 1) % len(k)])
    done = {}
    out = []
    for r, k in zip(rings, keys):
        nodes = [i for i, p in enumerate(k) if len(nbrs[p]) != 2]
        if not nodes:
            nodes = [min(range(len(k)), key=lambda i: k[i])]
        res = []
        for a, b in zip(nodes, nodes[1:] + [nodes[0] + len(k)]):
            idx = [i % len(k) for i in range(a, b + 1)]
            chain = tuple(k[i] for i in idx)
            flip = chain[-1] < chain[0] or (chain[-1] == chain[0] and chain[-2] < chain[1])
            canon = chain[::-1] if flip else chain
            if canon not in done:
                done[canon] = douglas_peucker(np.array(canon), tol)
            s = done[canon][::-1] if flip else done[canon]
            res.append(s[:-1])
        out.append(np.concatenate(res))
    return out


def polygons(rings):
    """Rings of one area to polygons: [outer, *holes]. Outer rings run clockwise in a shapefile."""
    outers = [r for r in rings if ring_area(r) < 0]
    holes = [r for r in rings if ring_area(r) >= 0]
    polys = [[o] for o in outers]
    for h in holes:
        for p in polys:
            if inside(h[:1], [p[0]])[0]:
                p.append(h)
                break
    return polys


def inside(pts, rings, chunk=4000):
    """Even-odd point in polygon for (n, 2) points against rings."""
    res = np.zeros(len(pts), bool)
    for c in range(0, len(pts), chunk):
        p = pts[c : c + chunk]
        px, py = p[:, :1], p[:, 1:2]
        hit = np.zeros(len(p), bool)
        for r in rings:
            x1, y1 = r[:, 0], r[:, 1]
            x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
            cross = (y1 > py) != (y2 > py)
            with np.errstate(divide="ignore", invalid="ignore"):
                xs = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
            hit ^= (np.sum(cross & (px < xs), axis=1) % 2).astype(bool)
        res[c : c + chunk] = hit
    return res


def label_point(poly, n=24):
    """A point well inside the polygon: of a grid over it, the one farthest from the edge."""
    outer = poly[0]
    (x0, y0), (x1, y1) = outer.min(0), outer.max(0)
    gx, gy = np.meshgrid(np.linspace(x0, x1, n + 2)[1:-1], np.linspace(y0, y1, n + 2)[1:-1])
    grid = np.column_stack([gx.ravel(), gy.ravel()])
    grid = grid[inside(grid, poly)]
    if not len(grid):
        return outer.mean(0)
    return grid[int(np.argmax(edge_dist(grid, poly)))]


def edge_dist(pts, rings):
    """Distance of each point to the nearest edge of the rings, in the units of the points."""
    edges = np.concatenate([np.stack([r, np.roll(r, -1, 0)], 1) for r in rings])
    a, b = edges[:, 0], edges[:, 1]
    d = b - a
    t = np.clip(((pts[:, None] - a) * d).sum(2) / np.maximum((d * d).sum(1), 1e-18), 0, 1)
    return np.hypot(*(pts[:, None] - (a + t[..., None] * d)).transpose(2, 0, 1)).min(1)


# --- Areas ---


def build(layer, stations, route_parts, tol=TOLERANCE_M):
    """Areas from (record, rings) pairs. stations: [{id, lon, lat}]. route_parts: [(name, [[lon, lat], ...])]."""
    flat = [(i, r) for i, (_, rings) in enumerate(layer) for r in rings]
    simple = simplify_rings([r for _, r in flat], tol)
    per_area = [[] for _ in layer]
    for (i, _), r in zip(flat, simple):
        if len(r) >= 3 and abs(ring_area(r)) > 0:
            per_area[i].append(r)

    areas = []
    for (rec, _), rings in zip(layer, per_area):
        polys = polygons(rings)
        polys.sort(key=lambda p: ring_area(p[0]))  # largest first (outer rings are negative)
        polys = polys[:1] + [p for p in polys[1:] if -ring_area(p[0]) >= MIN_RING_KM2 * 1e6]
        ll = [[utm_to_lonlat(r) for r in p] for p in polys]
        allpts = np.concatenate([p[0] for p in ll])
        label = utm_to_lonlat(label_point(polys[0])[None])[0]
        areas.append(
            {
                "id": rec["SN_RG"],
                "name": SHORT.get(rec["SN_RG"], rec["RG"]),
                "officialName": rec["RG"],
                "label": [round(float(label[0]), 4), round(float(label[1]), 4)],
                "bbox": [round(float(v), 4) for v in (*allpts.min(0), *allpts.max(0))],
                "outline": [[X.encode(r.tolist()) for r in p] for p in ll],
                "_rings": [r for p in ll for r in p],
            }
        )

    pts = np.array([[s["lon"], s["lat"]] for s in stations]) if stations else np.zeros((0, 2))
    where = locate(areas, pts)
    nearest(areas, pts, where, STATION_NEAR_KM)
    for ai, a in enumerate(areas):
        a["stations"] = sorted(stations[i]["id"] for i in np.flatnonzero(where == ai))

    km = [dict() for _ in areas]
    for name, line in route_parts:
        p = densify(line, ROUTE_STEP_KM)
        if not len(p):
            continue
        w = locate(areas, p)
        for ai, n in zip(*np.unique(w[w >= 0], return_counts=True)):
            km[ai][name] = km[ai].get(name, 0) + n * ROUTE_STEP_KM
    for a, k in zip(areas, km):
        a["routes"] = [[n, round(v)] for n, v in sorted(k.items(), key=lambda kv: (-kv[1], kv[0])) if v >= ROUTE_MIN_KM]
        del a["_rings"]
    return areas


def locate(areas, pts):
    """Index of the area each [lon, lat] point is in, -1 for none."""
    out = np.full(len(pts), -1)
    for ai, a in enumerate(areas):
        w, s, e, n = a["bbox"]
        cand = np.flatnonzero((out < 0) & (pts[:, 0] >= w) & (pts[:, 0] <= e) & (pts[:, 1] >= s) & (pts[:, 1] <= n))
        if len(cand):
            out[cand[inside(pts[cand], a["_rings"])]] = ai
    return out


def nearest(areas, pts, where, max_km):
    """Points in no area go to the nearest area within max_km. Changes where in place."""
    left = np.flatnonzero(where < 0)
    if not len(left):
        return
    best = np.full(len(left), max_km)
    pad = max_km / 70
    for ai, a in enumerate(areas):
        w, s, e, n = a["bbox"]
        p = pts[left]
        m = (p[:, 0] >= w - pad) & (p[:, 0] <= e + pad) & (p[:, 1] >= s - pad) & (p[:, 1] <= n + pad)
        if not m.any():
            continue
        k = np.cos(np.radians(p[m, 1].mean()))
        scale = np.array([k * 111.32, 110.57])
        d = edge_dist(p[m] * scale, [r * scale for r in a["_rings"]])
        idx = np.flatnonzero(m)[d < best[m]]
        best[idx] = d[d < best[m]]
        where[left[idx]] = ai


def densify(line, step_km):
    """Points every step_km along a [[lon, lat], ...] line."""
    p = np.array(line, float)
    if len(p) < 2:
        return p
    k = np.cos(np.radians(p[:, 1].mean()))
    seg = np.hypot(np.diff(p[:, 0]) * k * 111.32, np.diff(p[:, 1]) * 110.57)
    at = np.concatenate([[0], np.cumsum(seg)])
    t = np.arange(step_km / 2, at[-1], step_km)
    return np.column_stack([np.interp(t, at, p[:, 0]), np.interp(t, at, p[:, 1])])


def zip_path(cache):
    return os.path.join(cache, "ge250", "ge250.utm32s.shape.zip")


def write_into(data_dir, cache):
    with open(os.path.join(data_dir, "manifest.json")) as f:
        manifest = json.load(f)
    stations = X.read_places(data_dir)["stations"]
    parts = []
    if "routeStations" in manifest["files"]:
        with open(os.path.join(data_dir, manifest["files"]["routeStations"])) as f:
            for r in json.load(f)["routes"]:
                parts += [(r["name"], L.decode(p["line"])) for p in r["parts"]]
    src = zip_path(cache)
    year = datetime.date.fromtimestamp(os.path.getmtime(src)).year
    areas = build(read_layer(src), stations, parts)
    path = os.path.join(data_dir, "areas.json")
    with open(path, "w") as f:
        json.dump({"version": manifest["version"], "attribution": CREDIT.format(year=year), "areas": areas}, f, ensure_ascii=False, separators=(",", ":"))
    manifest["files"]["areas"] = "areas.json"
    with open(os.path.join(data_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
    with open(path, "rb") as f:
        gz = len(gzip.compress(f.read()))
    return {"areas": len(areas), "bytes": os.path.getsize(path), "gzipped": gz, "stations": sum(len(a["stations"]) for a in areas)}


def main():
    import download

    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--cache", default=os.path.join(HERE, "cache"))
    args = ap.parse_args()
    download.ge250(args.cache)
    s = write_into(args.data_dir, args.cache)
    print(f"areas: {s['areas']} areas, {s['stations']} stations, {s['bytes'] / 1024:.0f} KiB ({s['gzipped'] / 1024:.0f} KiB gzipped)")


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    main()
