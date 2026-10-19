"""Check the built data around a point: stations, connectivity and hotel towns.

Usage: python check_area.py <data_dir> <lon> <lat> [radius_km] [station]

<data_dir> holds manifest.json, e.g. apps/web/public/data/south-2026-10-19.
"""

import json
import math
import os
import sys
from collections import defaultdict

import graph as G


def tiles_near(manifest, lon, lat, radius_km):
    size = manifest["tiles"]["size"]
    dlat = radius_km / 111.0
    dlon = radius_km / (111.32 * math.cos(math.radians(lat)))
    keys = set(manifest["tiles"]["keys"])
    out = []
    for x in range(math.floor((lon - dlon) / size), math.floor((lon + dlon) / size) + 1):
        for y in range(math.floor((lat - dlat) / size), math.floor((lat + dlat) / size) + 1):
            if f"{x}_{y}" in keys:
                out.append(f"{x}_{y}")
    return out


def main(data_dir, lon, lat, radius_km=80.0, station_name=None):
    center = [lon, lat]
    with open(os.path.join(data_dir, "manifest.json")) as f:
        manifest = json.load(f)
    nodes, edges = {}, {}
    keys = tiles_near(manifest, lon, lat, radius_km)
    for k in keys:
        with open(os.path.join(data_dir, manifest["tiles"]["path"].format(key=k))) as f:
            tile = json.load(f)
        nodes.update({n["id"]: n for n in tile["nodes"]})
        edges.update({e["id"]: e for e in tile["edges"]})
    with open(os.path.join(data_dir, manifest["files"]["places"])) as f:
        places = json.load(f)
    print(f"version {manifest['version']}, {len(keys)} tiles, {len(nodes)} nodes, {len(edges)} edges")

    def dist(x):
        return G.dist_km(center, [x["lon"], x["lat"]])

    inside = {i for i, n in nodes.items() if dist(n) <= radius_km}
    adj = defaultdict(set)
    for e in edges.values():
        if e["from"] in inside and e["to"] in inside:
            adj[e["from"]].add(e["to"])
            adj[e["to"]].add(e["from"])
    for i in inside:
        adj[i]
    comp = G.components(adj)
    sizes = defaultdict(int)
    for c in comp.values():
        sizes[c] += 1
    main = max(sizes, key=sizes.get)
    print(f"within {radius_km:.0f} km: {len(inside)} nodes, {len(sizes)} parts, largest has {sizes[main] / len(inside):.1%} of nodes")

    stations = sorted((dist(s), s) for s in places["stations"] if s["nodeId"] is not None and dist(s) <= 5)
    print("\nstations within 5 km:")
    for d, s in stations:
        print(f"  {s['name']:40} {d:5.1f} km  node {s['nodeId']}  connected={comp.get(s['nodeId']) == main}")
    if station_name:
        found = [s for _, s in stations if s["name"] == station_name]
        print(f"\n{station_name}: {'found, node ' + str(found[0]['nodeId']) if found else 'MISSING'}")

    towns = sorted((dist(t), t) for t in places["towns"] if t["hotelCount"] > 0 and t["nodeId"] is not None and dist(t) <= radius_km)
    connected = [(d, t) for d, t in towns if comp.get(t["nodeId"]) == main]
    print(f"\ntowns with hotels within {radius_km:.0f} km: {len(towns)}, connected: {len(connected)}")
    print("  with 3+ hotels, 40 km or more away:")
    for d, t in connected:
        if d >= 40 and t["hotelCount"] >= 3:
            print(f"  {t['name']:32} {d:5.1f} km  hotels={t['hotelCount']}")

    route_km = defaultdict(float)
    for e in edges.values():
        if e["from"] in inside and e["routes"]:
            route_km[e["routes"][0]] += e["lengthKm"]
    print("\nlongest signed routes in the area (km as main route of an edge):")
    for name, km in sorted(route_km.items(), key=lambda kv: -kv[1])[:20]:
        print(f"  {name:50} {km:6.0f}")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], float(a[1]), float(a[2]), float(a[3]) if len(a) > 3 else 80.0, a[4] if len(a) > 4 else None)
