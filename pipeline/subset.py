"""Copy the tiles and places of a bbox into a small dataset, e.g. a test fixture.

Usage: python subset.py <data_dir> <out_dir> <west> <south> <east> <north> <region_name>
"""

import json
import math
import os
import sys

import export as X


def main(src, dst, west, south, east, north, name):
    with open(os.path.join(src, "manifest.json")) as f:
        manifest = json.load(f)
    tiles = manifest["tiles"]
    size = tiles["size"]
    keys = [
        f"{x}_{y}"
        for x in range(math.floor(west / size), math.floor(east / size) + 1)
        for y in range(math.floor(south / size), math.floor(north / size) + 1)
        if f"{x}_{y}" in tiles["keys"]
    ]
    node_ids = set()
    # JSON tiles, which tests read as they are.
    for k in keys:
        tile = X.load_tile(os.path.join(src, tiles["path"].format(key=k)))
        tile = {"version": manifest["version"], "tile": k, **tile}
        os.makedirs(os.path.join(dst, "tiles"), exist_ok=True)
        with open(os.path.join(dst, "tiles", f"{k}.json"), "w") as f:
            json.dump(tile, f, ensure_ascii=False, separators=(",", ":"))
        node_ids |= {n["id"] for n in tile["nodes"]}

    def inside(p):
        return west <= p["lon"] <= east and south <= p["lat"] <= north

    # One places.json: the subset is small, and the app reads it without a search index.
    places = X.read_places(src)
    out = {"version": places["version"]}
    for kind in ("towns", "stations", "hotels"):
        out[kind] = [p for p in places[kind] if inside(p)]
        for p in out[kind]:
            if p.get("nodeId") is not None and p["nodeId"] not in node_ids:
                p["nodeId"] = None
    with open(os.path.join(dst, "places.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    manifest["region"] = {"name": name, "bbox": [west, south, east, north]}
    manifest["files"] = {"places": "places.json"}
    manifest["tiles"].pop("places", None)
    manifest["tiles"].pop("format", None)
    manifest["tiles"]["path"] = "tiles/{key}.json"
    manifest["tiles"]["keys"] = keys
    with open(os.path.join(dst, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(dst) for x in fs)
    print(f"{len(keys)} tiles, {total / 1024 / 1024:.1f} MiB")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[1], *map(float, a[2:6]), a[6])
