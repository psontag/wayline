"""Check the built data around a station: connectivity, hotel towns, routes.

Usage: python check_area.py <data_dir> <station> [radius_km] [town ...]

<data_dir> holds manifest.json, e.g. apps/web/public/data/south-2026-10-19.
For each town, prints the best path from the station on the graph.
"""

import heapq
import json
import math
import os
import sys
from collections import Counter, defaultdict

import graph as G

K = 2  # cost = length / score^K, as the touring profile


def load(data_dir, center, radius_km):
    with open(os.path.join(data_dir, "manifest.json")) as f:
        manifest = json.load(f)
    tiles = manifest["tiles"]
    dlat = radius_km / 111.0
    dlon = radius_km / (111.32 * math.cos(math.radians(center[1])))
    nodes, edges = {}, {}
    keys = []
    for x in range(math.floor((center[0] - dlon) / tiles["size"]), math.floor((center[0] + dlon) / tiles["size"]) + 1):
        for y in range(math.floor((center[1] - dlat) / tiles["size"]), math.floor((center[1] + dlat) / tiles["size"]) + 1):
            key = f"{x}_{y}"
            if key not in tiles["keys"]:
                continue
            keys.append(key)
            with open(os.path.join(data_dir, tiles["path"].format(key=key))) as f:
                tile = json.load(f)
            nodes.update({n["id"]: n for n in tile["nodes"]})
            edges.update({e["id"]: e for e in tile["edges"]})
    print(f"version {manifest['version']}, {len(keys)} tiles, {len(nodes)} nodes, {len(edges)} edges")
    return nodes, edges


def best_path(adj, src, dst):
    cost, prev = {src: 0.0}, {}
    pq = [(0.0, src)]
    while pq:
        c, n = heapq.heappop(pq)
        if n == dst:
            break
        if c > cost[n]:
            continue
        for e in adj[n]:
            m = e["to"] if e["from"] == n else e["from"]
            nc = c + e["lengthKm"] / e["score"] ** K
            if nc < cost.get(m, math.inf):
                cost[m], prev[m] = nc, e
                heapq.heappush(pq, (nc, m))
    if dst not in prev:
        return None
    steps, n = [], dst
    while n != src:
        e = prev[n]
        steps.append(e)
        n = e["from"] if e["to"] == n else e["to"]
    return steps


def main(data_dir, station_name, radius_km=80.0, towns_to=()):
    with open(os.path.join(data_dir, "manifest.json")) as f:
        places_file = json.load(f)["files"]["places"]
    with open(os.path.join(data_dir, places_file)) as f:
        places = json.load(f)
    station = next((s for s in places["stations"] if s["name"] == station_name), None)
    if station is None or station["nodeId"] is None:
        sys.exit(f"{station_name}: not on the network")
    center = [station["lon"], station["lat"]]
    print(f"{station_name}: node {station['nodeId']}")
    nodes, edges = load(data_dir, center, radius_km)

    def dist(x):
        return G.dist_km(center, [x["lon"], x["lat"]])

    inside = {i for i, n in nodes.items() if dist(n) <= radius_km}
    adj = defaultdict(list)
    links = {i: set() for i in inside}
    for e in edges.values():
        adj[e["from"]].append(e)
        adj[e["to"]].append(e)
        if e["from"] in inside and e["to"] in inside:
            links[e["from"]].add(e["to"])
            links[e["to"]].add(e["from"])
    comp = G.components(links)
    sizes = Counter(comp.values())
    main_part = comp[station["nodeId"]]
    print(f"within {radius_km:.0f} km: {len(inside)} nodes in {len(sizes)} parts, {sizes[main_part] / len(inside):.1%} connected to the station")

    near = sorted((dist(s), s["name"]) for s in places["stations"] if s["nodeId"] is not None and dist(s) <= 5)
    print("stations within 5 km: " + ", ".join(name for _, name in near))

    towns = sorted((dist(t), t) for t in places["towns"] if t["hotelCount"] > 0 and t["nodeId"] in inside)
    connected = [(d, t) for d, t in towns if comp.get(t["nodeId"]) == main_part]
    print(f"\ntowns with hotels within {radius_km:.0f} km: {len(towns)}, connected to the station: {len(connected)}")
    print("with 3+ hotels, 40 km or more away:")
    print("\n".join(f"  {t['name']:30} {d:5.1f} km  {t['hotelCount']:3} hotels" for d, t in connected if d >= 40 and t["hotelCount"] >= 3))

    by_name = {t["name"]: t for _, t in towns}
    for name in towns_to:
        t = by_name.get(name)
        steps = best_path(adj, station["nodeId"], t["nodeId"]) if t else None
        if not steps:
            print(f"\n{name}: no path")
            continue
        km = sum(e["lengthKm"] for e in steps)
        signed = sum(e["lengthKm"] for e in steps if e["network"] != "connector" and e["routes"])
        routes = Counter()
        for e in steps:
            if e["routes"]:
                routes[e["routes"][0]] += e["lengthKm"]
        main_routes = ", ".join(f"{r} {v:.0f} km" for r, v in routes.most_common(3))
        print(f"\n{station_name} → {name}: {km:.0f} km, {signed / km:.0%} on named routes. Mostly: {main_routes}")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[1], float(a[2]) if len(a) > 2 else 80.0, a[3:])
