"""Vector tiles of the signed routes, for drawing them on the map.

Usage: python lines.py <data_dir>

Reads the network of a built dataset (tiles or network.json) and writes
<data_dir>/lines/{z}/{x}/{y}.pbf and <data_dir>/routes.json. Adds both to
manifest.json. Needs tippecanoe.

Routes are keyed by name, so the relations of one route (e.g. one per state)
count as one route.
"""

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict

MIN_ZOOM = 5
MAX_ZOOM = 11
# Lowest zoom a line is in the tiles at, by network class. Matches NetworkLayer.
CLASS_ZOOM = {"icn": 0, "ncn": 0, "rcn": 9, "lcn": 11, "connector": 11}
CLASS_ORDER = ["icn", "ncn", "rcn", "lcn", "connector"]


def decode(s):
    """Encoded polyline (5 decimals, lat before lon) to [[lon, lat], ...]."""
    coords, i, lat, lon = [], 0, 0, 0
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
        lat += vals[0]
        lon += vals[1]
        coords.append([lon / 1e5, lat / 1e5])
    return coords


def load_edges(data_dir, manifest):
    """All edges of the dataset, each once."""
    if not manifest.get("tiles"):
        with open(os.path.join(data_dir, manifest["files"]["network"])) as f:
            return json.load(f)["edges"]
    edges = {}
    tiles = manifest["tiles"]
    for key in tiles["keys"]:
        with open(os.path.join(data_dir, tiles["path"].replace("{key}", key))) as f:
            for e in json.load(f)["edges"]:
                edges[e["id"]] = e
    return list(edges.values())


def route_networks(osm_routes):
    """Route name -> best network class of its OSM relations."""
    out = {}
    for r in osm_routes:
        net = "lcn" if r["network"] == "other" else r["network"]
        if r["name"] and (r["name"] not in out or CLASS_ORDER.index(net) < CLASS_ORDER.index(out[r["name"]])):
            out[r["name"]] = net
    return out


def routes_table(edges, networks=None):
    """Route name -> id, network class, length and bbox.

    The class comes from `networks` (route_networks). Without it, from the
    edges: the class with the most km. An edge takes the class of the best
    route on it, so this can be too high for a route that mostly shares a
    better one.
    """
    routes = {}
    for e in edges:
        coords = decode(e["geometry"])
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        for name in e["routes"]:
            r = routes.setdefault(name, {"class_km": defaultdict(float), "km": 0.0, "bbox": [180, 90, -180, -90]})
            r["class_km"][e["network"]] += e["lengthKm"]
            r["km"] += e["lengthKm"]
            b = r["bbox"]
            r["bbox"] = [min(b[0], *lons), min(b[1], *lats), max(b[2], *lons), max(b[3], *lats)]
    out = []
    for i, name in enumerate(sorted(routes)):
        r = routes[name]
        net = (networks or {}).get(name) or max(r["class_km"], key=r["class_km"].get)
        out.append({"id": i + 1, "name": name, "network": net, "lengthKm": round(r["km"], 1), "bbox": [round(v, 4) for v in r["bbox"]]})
    return out


def features(edges, ids):
    """Signed edges as GeoJSON lines. `routes` holds route ids as "|1|5|", main route first."""
    for e in edges:
        if not e["routes"]:
            continue
        yield {
            "type": "Feature",
            "tippecanoe": {"minzoom": CLASS_ZOOM[e["network"]]},
            "properties": {"network": e["network"], "routes": "|" + "|".join(str(ids[n]) for n in e["routes"]) + "|"},
            "geometry": {"type": "LineString", "coordinates": decode(e["geometry"])},
        }


def tile_xy(lon, lat, z):
    n = 2**z
    lat = math.radians(max(-85.0, min(85.0, lat)))
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(lat)) / math.pi) / 2 * n)


def fill_empty(out, bounds):
    """Empty files for the tiles in bounds that tippecanoe left out. The host
    answers a missing file with the app page, which the map can't read."""
    west, south, east, north = bounds
    added = 0
    for z in range(MIN_ZOOM, MAX_ZOOM + 1):
        x0, y0 = tile_xy(west, north, z)
        x1, y1 = tile_xy(east, south, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                path = os.path.join(out, str(z), str(x), f"{y}.pbf")
                if not os.path.exists(path):
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    open(path, "wb").close()
                    added += 1
    return added


def build(data_dir, networks=None):
    """Writes the line tiles and routes.json. `networks` as route_networks returns."""
    with open(os.path.join(data_dir, "manifest.json")) as f:
        manifest = json.load(f)
    edges = load_edges(data_dir, manifest)
    routes = routes_table(edges, networks)
    ids = {r["name"]: r["id"] for r in routes}
    with open(os.path.join(data_dir, "routes.json"), "w") as f:
        json.dump({"version": manifest["version"], "routes": routes}, f, ensure_ascii=False, separators=(",", ":"))

    out = os.path.join(data_dir, "lines")
    shutil.rmtree(out, ignore_errors=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "routes.geojsonl")
        with open(src, "w") as f:
            for feat in features(edges, ids):
                f.write(json.dumps(feat, separators=(",", ":")) + "\n")
        subprocess.run(
            [
                "tippecanoe",
                "--quiet",
                f"--temporary-directory={tmp}",
                f"--output-to-directory={out}",
                "--layer=routes",
                f"--minimum-zoom={MIN_ZOOM}",
                f"--maximum-zoom={MAX_ZOOM}",
                # Plain files: the host compresses them like any other.
                "--no-tile-compression",
                # Keep every line at every zoom. Join neighbours instead.
                "--drop-rate=1",
                "--coalesce",
                "--reorder",
                src,
            ],
            check=True,
        )
    os.remove(os.path.join(out, "metadata.json"))
    boxes = [r["bbox"] for r in routes]
    bounds = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
    empty = fill_empty(out, bounds)

    manifest["files"]["routes"] = "routes.json"
    manifest["lines"] = {"path": "lines/{z}/{x}/{y}.pbf", "minzoom": MIN_ZOOM, "maxzoom": MAX_ZOOM, "bounds": bounds}
    with open(os.path.join(data_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))

    sizes = [os.path.getsize(os.path.join(d, n)) for d, _, names in os.walk(out) for n in names]
    return {"routes": len(routes), "files": len(sizes), "empty": empty, "bytes": sum(sizes), "max": max(sizes, default=0)}


if __name__ == "__main__":
    s = build(sys.argv[1])
    mb = 1024 * 1024
    print(f"lines: {s['routes']} routes, {s['files']} files ({s['empty']} empty), {s['bytes'] / mb:.1f} MiB, max {s['max'] / 1024:.0f} KiB")
