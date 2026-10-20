"""Build the route network and places for the region.

Usage: python build.py [--cache DIR] [--out DIR] [--states a,b]

Reads the downloads from the cache (see download.py) and writes
<out>/<version>/ with manifest.json, places.json and tiles/<x>_<y>.json,
plus <out>/latest.json that names the newest version.
"""

import argparse
import datetime
import json
import math
import os
import time
from collections import defaultdict

import download
import export as X
import extract as E
import graph as G
import region
from dem import Dem

HERE = os.path.dirname(os.path.abspath(__file__))


class Timer:
    def __init__(self):
        self.start = self.last = time.time()

    def step(self, name):
        now = time.time()
        print(f"{name}: {now - self.last:.0f} s", flush=True)
        self.last = now


def load_extract(cache, state):
    """Extract one state. The result is cached next to the download."""
    src = os.path.join(cache, "osm", f"{state}-latest.osm.pbf")
    dst = os.path.join(cache, "work", f"{state}.json")
    newest_input = max(os.path.getmtime(src), os.path.getmtime(E.__file__))
    if not os.path.exists(dst) or os.path.getmtime(dst) < newest_input:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        data = E.extract(src)
        with open(dst, "w") as f:
            json.dump(data, f)
        return data, src
    with open(dst) as f:
        return json.load(f), src


def tile_key(lon, lat):
    return f"{math.floor(lon / region.TILE_DEG)}_{math.floor(lat / region.TILE_DEG)}"


def split_tiles(network):
    """Each tile holds its nodes, all edges that touch them and the far ends of those edges."""
    nodes = network["nodes"]
    key_of = [tile_key(n["lon"], n["lat"]) for n in nodes]
    tile_nodes = defaultdict(set)
    tile_edges = defaultdict(list)
    for n in nodes:
        tile_nodes[key_of[n["id"]]].add(n["id"])
    for e in network["edges"]:
        for k in {key_of[e["from"]], key_of[e["to"]]}:
            tile_edges[k].append(e)
            tile_nodes[k].update((e["from"], e["to"]))
    tiles = {}
    for k in sorted(tile_nodes):
        tiles[k] = {
            "version": network["version"],
            "tile": k,
            "nodes": [nodes[i] for i in sorted(tile_nodes[k])],
            "edges": tile_edges[k],
        }
    return tiles


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(HERE, "cache"))
    ap.add_argument("--out", default=os.path.join(HERE, "..", "apps", "web", "public", "data"))
    ap.add_argument("--states", default=",".join(region.STATES))
    args = ap.parse_args()
    states = args.states.split(",")
    t = Timer()
    download.main(args.cache)
    t.step("download")

    parts, srcs = [], []
    for s in states:
        data, src = load_extract(args.cache, s)
        parts.append(data)
        srcs.append(src)
        print(f"{s}: {E.summary(data)}")
        t.step(f"extract {s}")
    data = E.merge(parts) if len(parts) > 1 else parts[0]
    print(f"merged: {E.summary(data)}")

    g = G.build(data)
    print("graph:", {k: round(v, 3) if isinstance(v, float) else v for k, v in g["stats"].items()})
    t.step("graph")

    osm_date = datetime.date.fromtimestamp(max(os.path.getmtime(p) for p in srcs)).isoformat()
    version = f"south-{osm_date}" if states == region.STATES else f"{'-'.join(states)}-{osm_date}"
    dem = Dem(os.path.join(args.cache, "dem"))
    network, index = X.export_network(g, dem, version)
    print(f"network: nodes={len(network['nodes'])} edges={len(network['edges'])}")
    t.step("elevation and geometry")

    places = X.export_places(data, g, index, version)
    tiles = split_tiles(network)
    out = os.path.join(args.out, version)
    sizes = {k: write(os.path.join(out, "tiles", f"{k}.json"), tile) for k, tile in tiles.items()}
    places_size = write(os.path.join(out, "places.json"), places)
    lons = [n["lon"] for n in network["nodes"]]
    lats = [n["lat"] for n in network["nodes"]]
    manifest = {
        "version": version,
        "region": {"name": region.NAME, "bbox": [min(lons), min(lats), max(lons), max(lats)]},
        "files": {"places": "places.json"},
        "tiles": {"size": region.TILE_DEG, "path": "tiles/{key}.json", "keys": sorted(tiles)},
        "createdAt": datetime.date.today().isoformat(),
    }
    write(os.path.join(out, "manifest.json"), manifest)
    write(os.path.join(args.out, "latest.json"), {"version": version, "manifest": f"{version}/manifest.json"})
    t.step("write")

    mb = 1024 * 1024
    s = sorted(sizes.values())
    print(f"out: {out}")
    print(f"places.json: {places_size / mb:.1f} MiB (towns={len(places['towns'])} stations={len(places['stations'])} hotels={len(places['hotels'])})")
    print(f"tiles: {len(s)} files, {sum(s) / mb:.1f} MiB, median {s[len(s) // 2] / mb:.2f} MiB, max {s[-1] / mb:.2f} MiB")
    print(f"total: {time.time() - t.start:.0f} s")


if __name__ == "__main__":
    main()
