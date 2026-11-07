"""Decode routing tiles (routing.py) into the arrays of route.mjs, to check
the tiles end to end against BRouter.

    uv run spike/routing/from_tiles.py <data_dir> <places.json> spike/routing/out-tiles
"""

import gzip
import json
import os
import shutil
import sys

import numpy as np


def read(path):
    with open(path, "rb") as f:
        return gzip.decompress(f.read())


def search_part(b):
    assert b[:4] == b"WRT1"
    n, m = np.frombuffer(b, "<u4", 2, 4)
    o = 12

    def take(dtype, count):
        nonlocal o
        a = np.frombuffer(b, dtype, count, o)
        o += a.nbytes
        return a

    ids = np.cumsum(take("<i4", n))
    lon = np.cumsum(take("<i4", n))
    lat = np.cumsum(take("<i4", n))
    frm = np.cumsum(take("<i4", m))
    to = take("<i4", m)
    length = take("<u4", m)
    bits = take("<u2", m)
    down_f = take("<u2", m)
    down_b = take("<u2", m)
    assert o == len(b)
    return ids, lon, lat, ids[frm], ids[to], length, bits, down_f, down_b


def geometry_part(b, from_lon, from_lat):
    assert b[:4] == b"WRG1"
    m, p = np.frombuffer(b, "<u4", 2, 4)
    dlon = np.frombuffer(b, "<i4", p, 12)
    dlat = np.frombuffer(b, "<i4", p, 12 + 4 * p)
    count = np.frombuffer(b, "<u2", m, 12 + 8 * p).astype(np.int64)
    first = np.cumsum(count) - count
    edge_of = np.repeat(np.arange(m), count)
    # Deltas restart at the from node of each edge.
    lon, lat = dlon.astype(np.int64), dlat.astype(np.int64)
    if p:
        lon[first[count > 0]] += from_lon[count > 0]
        lat[first[count > 0]] += from_lat[count > 0]
        group = np.repeat(first, count)
        lon = np.cumsum(lon) - np.r_[0, np.cumsum(lon)][group]
        lat = np.cumsum(lat) - np.r_[0, np.cumsum(lat)][group]
    return lon, lat, count, edge_of


def main(data_dir, places, out):
    with open(os.path.join(data_dir, "manifest.json")) as f:
        manifest = json.load(f)
    r = manifest["routing"]
    node_lon, node_lat = {}, {}
    seen = set()
    rows, shapes, sizes = [], [], {}
    for k in r["keys"]:
        sp = os.path.join(data_dir, r["path"].format(key=k))
        gp = os.path.join(data_dir, r["geometry"].format(key=k))
        sizes[k] = {"4": [os.path.getsize(sp), os.path.getsize(gp)]}
        ids, lon, lat, frm, to, length, bits, down_f, down_b = search_part(read(sp))
        node_lon.update(zip(ids.tolist(), lon.tolist()))
        node_lat.update(zip(ids.tolist(), lat.tolist()))
        at = {i: j for j, i in enumerate(ids.tolist())}
        f_lon = np.array([lon[at[i]] for i in frm.tolist()], dtype=np.int64)
        f_lat = np.array([lat[at[i]] for i in frm.tolist()], dtype=np.int64)
        s_lon, s_lat, count, _ = geometry_part(read(gp), f_lon, f_lat)
        first = np.cumsum(count) - count
        for i in range(len(frm)):
            key = (int(frm[i]), int(to[i]), int(length[i]), int(bits[i]), int(down_f[i]))
            if key in seen:
                continue
            seen.add(key)
            rows.append((int(frm[i]), int(to[i]), int(length[i]), int(bits[i]), int(down_f[i]), int(down_b[i])))
            a, c = first[i], count[i]
            shapes.append(np.stack([s_lon[a : a + c], s_lat[a : a + c]], axis=1))

    os.makedirs(out, exist_ok=True)
    n = max(node_lon) + 1
    nodes = np.zeros((n, 2), dtype=np.int32)
    for i, v in node_lon.items():
        nodes[i] = (round(v / 10), round(node_lat[i] / 10))  # route.mjs wants 1e5
    edges, descent, ways, shape = [], [], [], [np.zeros((0, 2), dtype=np.int64)]
    offset = 0
    for (frm, to, length, bits, down_f, down_b), pts in zip(rows, shapes):
        fwd = length if bits >> 12 & 1 else -1
        bwd = length if bits >> 13 & 1 else -1
        edges.append((frm, to, length, fwd, bwd, 4, offset))
        descent.append((round(down_f / 10), round(down_b / 10)))
        ways.append(bits & 0xFFF)
        shape.append(np.round(pts / 10))
        offset += len(pts)
    shape.append(np.zeros((1, 2)))
    for name, arr in (
        ("nodes", nodes),
        ("edges", np.array(edges)),
        ("descent", np.array(descent)),
        ("ways", np.array(ways)),
        ("shape", np.concatenate(shape)),
    ):
        arr.astype("<i4").tofile(os.path.join(out, f"{name}.bin"))
    with open(os.path.join(out, "tiles.json"), "w") as f:
        json.dump({"tile": r["size"], "levels": ["", "", "", "", "all"], "highways": r["highways"], "sizes": sizes}, f)
    shutil.copy(places, os.path.join(out, "places.json"))
    print(f"{n} nodes, {len(edges)} edges, {offset} shape points")


main(*sys.argv[1:])
