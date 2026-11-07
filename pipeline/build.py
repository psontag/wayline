"""Build the route network and places for the region.

Usage: python build.py [--cache DIR] [--out DIR] [--states a,b]

Reads the downloads from the cache (see download.py) and writes
<out>/<version>/ with manifest.json, search.json, tiles/<x>_<y>.json,
places/<x>_<y>.json, the route lines (lines.py) and the routing tiles
route/<x>_<y>.bin (routing.py), plus <out>/latest.json
that names the newest version.
"""

import argparse
import datetime
import hashlib
import json
import math
import os
import time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor

import download
import export as X
import extract as E
import graph as G
import lines as L
import region
import routing as R
import scenery as S
from dem import Dem

HERE = os.path.dirname(os.path.abspath(__file__))


def pipeline_hash():
    """Short hash of the pipeline code, so a pipeline change gives a new version.

    Files under /data/<version>/ are cached forever. Same files as the CI cache key.
    """
    h = hashlib.sha256()
    names = sorted(n for n in os.listdir(HERE) if n.endswith(".py")) + ["requirements.txt"]
    for n in names:
        with open(os.path.join(HERE, n), "rb") as f:
            h.update(n.encode() + b"\0" + f.read())
    return h.hexdigest()[:8]


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


def scenery_file(cache, state):
    """Scenery of one state (see scenery.extract). Cached like load_extract."""
    src = os.path.join(cache, "osm", f"{state}-latest.osm.pbf")
    dst = os.path.join(cache, "work", f"{state}-scenery.npz")
    if not os.path.exists(dst) or os.path.getmtime(dst) < max(os.path.getmtime(src), os.path.getmtime(S.__file__)):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        # In a child process, so its memory is free again afterwards.
        with ProcessPoolExecutor(1) as pool:
            pool.submit(S.extract_to, src, dst).result()
    return dst


def routing_file(cache, state):
    """Ways of one state for the routing tiles (see routing.extract). Cached like load_extract."""
    src = os.path.join(cache, "osm", f"{state}-latest.osm.pbf")
    dst = os.path.join(cache, "work", f"{state}-routing.npz")
    newest_input = max(os.path.getmtime(p) for p in (src, R.__file__, E.__file__, os.path.join(HERE, "dem.py")))
    if not os.path.exists(dst) or os.path.getmtime(dst) < newest_input:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with ProcessPoolExecutor(1) as pool:
            pool.submit(R.extract_to, src, os.path.join(cache, "dem"), dst).result()
    return dst


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
    download.main(args.cache, states)
    t.step("download")

    srcs = [os.path.join(args.cache, "osm", f"{s}-latest.osm.pbf") for s in states]
    osm_date = datetime.date.fromtimestamp(max(os.path.getmtime(p) for p in srcs)).isoformat()
    name = region.ID if states == region.STATES else "-".join(states)
    version = f"{name}-{osm_date}-{pipeline_hash()}"
    out = os.path.join(args.out, version)

    # Routing tiles first, each step in a child process, so their memory is
    # free again before the route graph.
    routing_files = [routing_file(args.cache, s) for s in states]
    t.step("routing extract")
    with ProcessPoolExecutor(1) as pool:
        routing, routing_stats = pool.submit(R.build, routing_files, out).result()
    t.step("routing tiles")

    # Extracted before the route extracts and loaded after the graph, so the
    # peaks of the three steps don't add up.
    scenery_files = [scenery_file(args.cache, s) for s in states]
    t.step("scenery")

    parts = []
    for s in states:
        data, _ = load_extract(args.cache, s)
        parts.append(data)
        print(f"{s}: {E.summary(data)}")
        t.step(f"extract {s}")
    data = E.merge(parts) if len(parts) > 1 else parts[0]
    del parts
    print(f"merged: {E.summary(data)}")

    g = G.build(data)
    print("graph:", {k: round(v, 3) if isinstance(v, float) else v for k, v in g["stats"].items()})
    t.step("graph")
    scenery = S.Scenery(*S.merge(S.load(f) for f in scenery_files))

    dem = Dem(os.path.join(args.cache, "dem"))
    network, index = X.export_network(g, dem, version, scenery)
    print(f"network: nodes={len(network['nodes'])} edges={len(network['edges'])}")
    t.step("elevation, geometry and scenery")
    del scenery

    places = X.export_places(data, g, index, version)
    tiles = split_tiles(network)
    sizes = {k: write(os.path.join(out, "tiles", f"{k}.json"), tile) for k, tile in tiles.items()}
    place_tiles = X.split_places(places, network["nodes"], tile_key)
    place_sizes = [write(os.path.join(out, "places", f"{k}.json"), p) for k, p in place_tiles.items()]
    search_size = write(os.path.join(out, "search.json"), X.search_index(places))
    lons = [n["lon"] for n in network["nodes"]]
    lats = [n["lat"] for n in network["nodes"]]
    manifest = {
        "version": version,
        "region": {"name": region.NAME, "bbox": [min(lons), min(lats), max(lons), max(lats)]},
        "files": {"search": "search.json"},
        "tiles": {
            "size": region.TILE_DEG,
            "path": "tiles/{key}.json",
            "keys": sorted(tiles),
            "places": {"path": "places/{key}.json", "keys": sorted(place_tiles)},
        },
        "routing": routing,
        "createdAt": datetime.date.today().isoformat(),
    }
    write(os.path.join(out, "manifest.json"), manifest)
    # Replaced, not written through: in a worktree it is a link to the main checkout.
    latest = os.path.join(args.out, "latest.json")
    write(latest + ".tmp", {"version": version, "manifest": f"{version}/manifest.json"})
    os.replace(latest + ".tmp", latest)
    t.step("write")
    lines = L.build(out, L.route_networks(data["routes"]))
    t.step("lines")

    mb = 1024 * 1024
    s = sorted(sizes.values())
    print(f"out: {out}")
    print(f"places: towns={len(places['towns'])} stations={len(places['stations'])} hotels={len(places['hotels'])}")
    print(f"place tiles: {len(place_sizes)} files, {sum(place_sizes) / mb:.1f} MiB, max {max(place_sizes) / 1024:.0f} KiB")
    print(f"search.json: {search_size / mb:.2f} MiB")
    print(f"tiles: {len(s)} files, {sum(s) / mb:.1f} MiB, median {s[len(s) // 2] / mb:.2f} MiB, max {s[-1] / mb:.2f} MiB")
    print(f"lines: {lines['routes']} routes, {lines['files']} files ({lines['empty']} empty), {lines['bytes'] / mb:.1f} MiB, max {lines['max'] / 1024:.0f} KiB")
    print("scenery:", S.stats(network["edges"]))
    print("routing:", routing_stats)
    print(f"total: {time.time() - t.start:.0f} s")


if __name__ == "__main__":
    main()
