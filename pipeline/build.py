"""Build the route network and places for the region.

Usage: python build.py [--cache DIR] [--out DIR] [--area germany|<state>]

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
import subprocess
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


# What extract.py, scenery.py and routing.py read, with the nodes of the ways
# and the members of the relations. The rest of the OSM file is dropped.
OSM_FILTER = [
    "r/route=bicycle",
    "w/highway",
    "w/route=ferry",
    "nwr/tourism=hotel,guest_house,motel,attraction,viewpoint,museum",
    "nwr/historic=castle,ruins,monastery,city_gate",
    "n/place=city,town,village",
    "n/railway=station,halt",
    "nwr/landuse=forest,vineyard",
    "nwr/natural=wood,water",
    "nwr/leisure=nature_reserve",
    "nwr/boundary=national_park,protected_area",
    "w/waterway=river,canal",
]


def stale(dst, *inputs):
    return not os.path.exists(dst) or os.path.getmtime(dst) < max(os.path.getmtime(p) for p in inputs)


def osm_file(cache, area):
    """The OSM file of the area, filtered by osmium-tool. Cached next to the download."""
    src = os.path.join(cache, "osm", f"{area}-latest.osm.pbf")
    dst = os.path.join(cache, "work", f"{area}-filtered.osm.pbf")
    if stale(dst, src, __file__):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["osmium", "tags-filter", "--overwrite", "-o", dst, src, *OSM_FILTER], check=True)
    return dst


def load_extract(cache, area, src):
    """Routes, places, stations and hotels (see extract.extract). Cached like osm_file."""
    dst = os.path.join(cache, "work", f"{area}.json")
    if stale(dst, src, E.__file__):
        data = E.extract(src)
        with open(dst, "w") as f:
            json.dump(data, f)
        return data
    with open(dst) as f:
        return json.load(f)


def scenery_file(cache, area, src):
    """Scenery (see scenery.extract). Cached like osm_file."""
    dst = os.path.join(cache, "work", f"{area}-scenery.npz")
    if stale(dst, src, S.__file__):
        # In a child process, so its memory is free again afterwards.
        with ProcessPoolExecutor(1) as pool:
            pool.submit(S.extract_to, src, dst).result()
    return dst


def routing_file(cache, area, src):
    """Ways for the routing tiles (see routing.extract). Cached like osm_file."""
    dst = os.path.join(cache, "work", f"{area}-routing")
    if stale(dst, src, R.__file__, E.__file__, os.path.join(HERE, "dem.py")):
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
    ap.add_argument("--area", default=region.AREA, help="germany, or one state such as hessen")
    args = ap.parse_args()
    area = args.area
    t = Timer()
    download.main(args.cache, area)
    t.step("download")

    raw = os.path.join(args.cache, "osm", f"{area}-latest.osm.pbf")
    osm_date = datetime.date.fromtimestamp(os.path.getmtime(raw)).isoformat()
    name = region.ID if area == region.AREA else area
    version = f"{name}-{osm_date}-{pipeline_hash()}"
    out = os.path.join(args.out, version)
    src = osm_file(args.cache, area)
    t.step("filter")

    # Scenery and routing tiles first, each step in a child process, so their
    # memory is free again before the route graph.
    scenery_npz = scenery_file(args.cache, area, src)
    t.step("scenery")
    routing_dir = routing_file(args.cache, area, src)
    t.step("routing extract")
    routing_graph = routing_dir + "-graph"
    with ProcessPoolExecutor(1) as pool:
        routing, routing_stats = pool.submit(R.build, routing_dir, scenery_npz, out, routing_graph).result()
    t.step("routing tiles")

    data = load_extract(args.cache, area, src)
    print(f"extract: {E.summary(data)}")
    t.step("extract")

    def route_links(pairs):
        # In a child process, so the routing graph is freed before the export.
        with ProcessPoolExecutor(1) as pool:
            return pool.submit(R.route_pairs, routing_graph, pairs).result()

    g = G.build(data, route_links)
    print("graph:", {k: round(v, 3) if isinstance(v, float) else v for k, v in g["stats"].items()})
    t.step("graph")
    scenery = S.Scenery(*S.merge([S.load(scenery_npz)]))

    dem = Dem(os.path.join(args.cache, "dem"))
    network, index = X.export_network(g, dem, version, scenery)
    print(f"network: nodes={len(network['nodes'])} edges={len(network['edges'])}")
    t.step("elevation, geometry and scenery")
    del scenery

    places = X.export_places(data, g, index, version)
    tiles = split_tiles(network)
    os.makedirs(os.path.join(out, "tiles"), exist_ok=True)
    packed = {k: X.pack_tile(tile) for k, tile in tiles.items()}
    unpacked_mib = sum(len(b) for b in packed.values()) / 2**20
    sizes = {k: R.write_gz(os.path.join(out, "tiles", f"{k}.bin"), b) for k, b in packed.items()}
    del packed
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
            "format": 1,
            "path": "tiles/{key}.bin",
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
    print(f"tiles: {len(s)} files, {unpacked_mib:.1f} MiB ({sum(s) / mb:.1f} MiB gzipped), median {s[len(s) // 2] / mb:.2f} MiB, max {s[-1] / mb:.2f} MiB gzipped")
    print(f"lines: {lines['routes']} routes, {lines['files']} files ({lines['empty']} empty), {lines['bytes'] / mb:.1f} MiB, max {lines['max'] / 1024:.0f} KiB")
    print("scenery:", S.stats(network["edges"]))
    print("routing:", routing_stats)
    print(f"total: {time.time() - t.start:.0f} s")


if __name__ == "__main__":
    main()
