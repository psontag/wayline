"""Copy the tiles and places of a bbox into a small dataset, e.g. a test fixture.

Usage: python subset.py <data_dir> <out_dir> <west> <south> <east> <north> <region_name>
"""

import json
import math
import os
import shutil
import sys


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
    for k in keys:
        path = tiles["path"].format(key=k)
        os.makedirs(os.path.dirname(os.path.join(dst, path)), exist_ok=True)
        shutil.copy(os.path.join(src, path), os.path.join(dst, path))
        with open(os.path.join(src, path)) as f:
            node_ids |= {n["id"] for n in json.load(f)["nodes"]}

    def inside(p):
        return west <= p["lon"] <= east and south <= p["lat"] <= north

    with open(os.path.join(src, manifest["files"]["places"])) as f:
        places = json.load(f)
    out = {"version": places["version"]}
    for kind in ("towns", "stations", "hotels"):
        out[kind] = [p for p in places[kind] if inside(p)]
        for p in out[kind]:
            if p.get("nodeId") is not None and p["nodeId"] not in node_ids:
                p["nodeId"] = None
    with open(os.path.join(dst, manifest["files"]["places"]), "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    manifest["region"] = {"name": name, "bbox": [west, south, east, north]}
    manifest["tiles"]["keys"] = keys
    with open(os.path.join(dst, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(dst) for x in fs)
    print(f"{len(keys)} tiles, {total / 1024 / 1024:.1f} MiB")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[1], *map(float, a[2:6]), a[6])
