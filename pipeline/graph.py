"""Build the route network graph from the extracted OSM data (docs/05).

The fine graph on OSM nodes lives in numpy arrays: Germany has millions of
nodes, too many for Python dicts on the CI runner.
"""

import math
from collections import defaultdict
from itertools import chain

import numpy as np

SNAP_KM = 1.5  # towns and stations within this distance get a node
HOTEL_KM = 2.0  # a hotel counts for the nearest town within this distance
GAP_KM = 1.0  # dead ends get an unsigned connector to another component within this distance
CONNECTOR_DETOUR = 1.3  # connector length = straight line x this

NETWORK_RANK = {"icn": 0, "ncn": 1, "rcn": 2, "lcn": 3, "other": 4, "connector": 5}
NETWORK_SCORE = {"icn": 1.0, "ncn": 0.95, "rcn": 0.85, "lcn": 0.75, "other": 0.7, "connector": 0.4}
NETWORKS = sorted(NETWORK_RANK, key=NETWORK_RANK.get)  # index = rank
SURFACES = ["paved", "gravel", "rough", "unknown"]

PAVED = {"asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "chipseal", "sett", "metal", "wood"}
GOOD_UNPAVED = {"compacted", "fine_gravel"}
MAIN_ROADS = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"}
ROADS = MAIN_ROADS | {"tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service", "road"}


def dist_km(a, b):
    """Equirectangular distance between two [lon, lat] points."""
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = math.radians(b[1] - a[1])
    return 6371.0 * math.hypot(x, y)


def dist_km_np(a, b):
    """dist_km for arrays of [lon, lat] rows."""
    x = np.radians(b[..., 0] - a[..., 0]) * np.cos(np.radians((a[..., 1] + b[..., 1]) / 2))
    y = np.radians(b[..., 1] - a[..., 1])
    return 6371.0 * np.hypot(x, y)


def surface_class(way):
    """Return (class, tagged). class is 'paved', 'gravel', 'rough' or 'unknown'."""
    s = way.get("surface")
    if s:
        if s in PAVED:
            return "paved", True
        if s in GOOD_UNPAVED:
            return "gravel", True
        return "rough", True
    tt = way.get("tracktype")
    if tt == "grade1":
        return "paved", False
    if tt in ("grade2", "grade3"):
        return "gravel", False
    if tt in ("grade4", "grade5"):
        return "rough", False
    hw = way.get("highway")
    if hw in ROADS or hw == "cycleway":
        return "paved", False
    if hw == "track":
        return "gravel", False
    return "unknown", False


def segment_score(network, surface, highway):
    s = NETWORK_SCORE[network]
    s *= {"paved": 1.0, "gravel": 0.85, "rough": 0.6, "unknown": 0.85}[surface]
    if highway in MAIN_ROADS:
        s *= 0.7
    return s


class Grid:
    """Simple spatial hash for nearest-point lookups."""

    CELL = 0.01

    def __init__(self):
        self.cells = defaultdict(list)

    def add(self, key, loc):
        self.cells[(int(loc[0] / self.CELL), int(loc[1] / self.CELL))].append((key, loc))

    def near(self, loc, radius_km):
        r_lat = int(radius_km / 111 / self.CELL) + 1
        r_lon = int(radius_km / (111 * math.cos(math.radians(loc[1]))) / self.CELL) + 1
        cx, cy = int(loc[0] / self.CELL), int(loc[1] / self.CELL)
        out = []
        for dx in range(-r_lon, r_lon + 1):
            for dy in range(-r_lat, r_lat + 1):
                for key, p in self.cells.get((cx + dx, cy + dy), ()):
                    d = dist_km(loc, p)
                    if d <= radius_km:
                        out.append((d, key, p))
        out.sort(key=lambda t: t[0])
        return out


class NodeGrid:
    """Grid like Grid over an array of [lon, lat] rows. Keys are row numbers."""

    CELL = 0.01

    def __init__(self, xy):
        self.xy = xy
        cells = self.cell(xy[:, 0]) * 2**20 + self.cell(xy[:, 1])
        self.order = np.argsort(cells, kind="stable")
        self.cells = cells[self.order]

    def cell(self, v):
        return np.floor(np.asarray(v) / self.CELL).astype(np.int64)

    def near(self, loc, radius_km):
        """(km, rows) within radius_km, nearest first."""
        r_lat = int(radius_km / 111 / self.CELL) + 1
        r_lon = int(radius_km / (111 * math.cos(math.radians(loc[1]))) / self.CELL) + 1
        cx, cy = int(self.cell(loc[0])), int(self.cell(loc[1]))
        rows = []
        for x in range(cx - r_lon, cx + r_lon + 1):
            lo = np.searchsorted(self.cells, x * 2**20 + cy - r_lat)
            hi = np.searchsorted(self.cells, x * 2**20 + cy + r_lat, side="right")
            rows.append(self.order[lo:hi])
        rows = np.concatenate(rows)
        d = dist_km_np(np.asarray(loc, dtype=float), self.xy[rows])
        keep = d <= radius_km
        rows, d = rows[keep], d[keep]
        by_km = np.argsort(d, kind="stable")
        return d[by_km], rows[by_km]


def csr(a, b, n):
    """Adjacency of n nodes from segments a-b: offsets, the other node and the segment at each slot."""
    ends = np.concatenate([a, b])
    order = np.argsort(ends, kind="stable")
    offsets = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(np.bincount(ends, minlength=n), out=offsets[1:])
    other = np.concatenate([b, a])[order]
    seg = np.tile(np.arange(len(a)), 2)[order]
    return offsets, other, seg


def components_csr(offsets, other):
    """Component id (its first node) of each node."""
    n = len(offsets) - 1
    comp = np.full(n, -1, dtype=np.int64)
    for start in range(n):
        if comp[start] >= 0:
            continue
        comp[start] = start
        stack = [start]
        while stack:
            x = stack.pop()
            for y in other[offsets[x] : offsets[x + 1]]:
                if comp[y] < 0:
                    comp[y] = start
                    stack.append(y)
    return comp


def build(data):
    """Route graph from the extract. Takes data["ways"] out of data to free it early."""
    ways = data.pop("ways")
    # Best network and names per way.
    way_net = {}
    way_routes = defaultdict(set)
    for r in data["routes"]:
        for wid in r["ways"]:
            w = str(wid)
            if w not in ways:
                continue
            if r["name"]:
                way_routes[w].add(r["name"])
            if w not in way_net or NETWORK_RANK[r["network"]] < NETWORK_RANK[way_net[w]]:
                way_net[w] = r["network"]

    # Attributes per way. The last row is for connectors.
    way_ids = list(ways)
    attrs = []
    for wid in way_ids:
        surf, tagged = surface_class(ways[wid])
        net = way_net[wid]
        attrs.append((NETWORK_RANK[net], SURFACES.index(surf), tagged, segment_score(net, surf, ways[wid]["highway"])))
    attrs.append((NETWORK_RANK["connector"], SURFACES.index("unknown"), False, segment_score("connector", "unknown", None)))
    w_net, w_surf, w_tagged, w_score = (np.array(c) for c in zip(*attrs))
    connector = len(way_ids)

    # Segments between neighboring points of a way.
    counts = np.fromiter((len(ways[w]["nodes"]) for w in way_ids), np.int64, len(way_ids))
    total = int(counts.sum())
    ids = np.fromiter(chain.from_iterable(ways[w]["nodes"] for w in way_ids), np.int64, total)
    xy = np.fromiter(chain.from_iterable(chain.from_iterable(ways[w]["coords"] for w in way_ids)), float, 2 * total).reshape(-1, 2)
    del ways
    point_way = np.repeat(np.arange(len(way_ids)), counts)
    inner = np.ones(total, dtype=bool)
    inner[np.cumsum(counts) - 1] = False  # last point of each way
    j = np.nonzero(inner)[0]
    j = j[ids[j] != ids[j + 1]]

    # Dense node numbers. Each node pair keeps the segment of its best network.
    nodes, inverse = np.unique(np.concatenate([ids[j], ids[j + 1]]), return_inverse=True)
    n = len(nodes)
    a, b = inverse[: len(j)], inverse[len(j) :]
    node_xy = np.empty((n, 2))
    node_xy[a], node_xy[b] = xy[j], xy[j + 1]
    seg_way = point_way[j]
    pair = np.minimum(a, b) * n + np.maximum(a, b)
    order = np.lexsort((np.arange(len(j)), w_net[seg_way], pair))
    first = np.r_[True, pair[order][1:] != pair[order][:-1]]
    keep = order[first]
    s_a, s_b, s_way = a[keep], b[keep], seg_way[keep]
    s_km = dist_km_np(xy[j[keep]], xy[j[keep] + 1])
    del ids, xy, point_way, inner, j, inverse, a, b, seg_way, pair, order, first, keep

    grid = NodeGrid(node_xy)
    offsets, other, _ = csr(s_a, s_b, n)
    comp = components_csr(offsets, other)
    stats = {"fine_nodes": n, "components_before": len(np.unique(comp))}

    # Unsigned connectors from dead ends to the nearest node of another component.
    connectors = 0
    links = {}
    for x in np.nonzero(np.diff(offsets) == 1)[0]:
        for d, y in zip(*grid.near(node_xy[x], GAP_KM)):
            if comp[y] != comp[x]:
                links[(min(x, y), max(x, y))] = d * CONNECTOR_DETOUR  # two dead ends can find each other
                connectors += 1
                break
    if links:
        s_a = np.concatenate([s_a, [k[0] for k in links]])
        s_b = np.concatenate([s_b, [k[1] for k in links]])
        s_way = np.concatenate([s_way, np.full(len(links), connector)])
        s_km = np.concatenate([s_km, list(links.values())])
    offsets, other, seg_at = csr(s_a, s_b, n)
    comp = components_csr(offsets, other)
    ids, sizes = np.unique(comp, return_counts=True)
    main_comp = ids[np.argmax(sizes)]
    stats.update(
        connectors=connectors,
        components_after=len(ids),
        main_component_share=sizes.max() / n,
    )

    # Towns and stations snap to the nearest route point.
    # Each hotel counts for its nearest place only.
    place_grid = Grid()
    for p in data["places"]:
        place_grid.add(p["id"], p["loc"])
    hotels_at = defaultdict(int)
    for h in data["hotels"]:
        near = place_grid.near(h["loc"], HOTEL_KM)
        if near:
            hotels_at[near[0][1]] += 1
    key = np.diff(offsets) != 2

    def snap(p):
        d, rows = grid.near(p["loc"], SNAP_KM)
        if not len(rows):
            return None
        key[rows[0]] = True
        return {"node": int(nodes[rows[0]]), "snap_km": float(d[0]), "main": bool(comp[rows[0]] == main_comp)}

    towns = []
    for p in data["places"]:
        s = snap(p)
        if s:
            towns.append({**p, **s, "hotels": hotels_at[p["id"]]})
    stations = []
    for p in data["stations"]:
        s = snap(p)
        if s:
            stations.append({**p, **s})

    seg = {
        "km": s_km,
        "net": w_net[s_way],
        "surface": w_surf[s_way],
        "tagged": w_tagged[s_way],
        "score": w_score[s_way],
        "way": s_way,
    }
    edges = []
    for chain_nodes, chain_segs in chains(offsets, other, seg_at, key):
        e = make_edge(np.array(chain_segs), seg, way_ids, connector)
        e.update(a=int(nodes[chain_nodes[0]]), b=int(nodes[chain_nodes[-1]]), coords=node_xy[chain_nodes].tolist())
        route_km = defaultdict(float)
        for wid, km in e.pop("way_km").items():
            for name in way_routes[wid]:
                route_km[name] += km
        e["routes"] = dict(route_km)
        edges.append(e)
    graph = defaultdict(list)
    for i, e in enumerate(edges):
        graph[e["a"]].append((e["b"], i))
        graph[e["b"]].append((e["a"], i))
    coord = {int(nodes[i]): node_xy[i].tolist() for i in np.nonzero(key)[0]}

    stats.update(
        nodes=len(graph),
        edges=len(edges),
        route_km=sum(e["len"] - e["km"]["connector"] for e in edges),
        connector_km=sum(e["km"]["connector"] for e in edges),
        towns_near_routes=len(towns),
        towns_with_hotels=sum(1 for t in towns if t["hotels"] > 0),
        stations_near_routes=len(stations),
    )
    return {"edges": edges, "graph": graph, "coord": coord, "towns": towns, "stations": stations, "stats": stats}


def components(adj):
    comp = {}
    for start in adj:
        if start in comp:
            continue
        comp[start] = start
        stack = [start]
        while stack:
            n = stack.pop()
            for m in adj[n]:
                if m not in comp:
                    comp[m] = start
                    stack.append(m)
    return comp


def chains(offsets, other, seg_at, key):
    """Chains of nodes between key nodes, as (nodes, segments)."""
    seen = np.zeros(int(seg_at.max()) + 1 if len(seg_at) else 0, dtype=bool)
    for a in np.nonzero(key)[0]:
        for slot in range(offsets[a], offsets[a + 1]):
            if seen[seg_at[slot]]:
                continue
            nodes, segs = [a, other[slot]], [seg_at[slot]]
            while not key[nodes[-1]]:
                x = nodes[-1]
                nxt = [s for s in range(offsets[x], offsets[x + 1]) if other[s] != nodes[-2]]
                if not nxt:
                    break
                nodes.append(other[nxt[0]])
                segs.append(seg_at[nxt[0]])
            seen[segs] = True
            yield nodes, segs


def make_edge(segs, seg, way_ids, connector):
    km = seg["km"][segs]
    length = float(km.sum())
    by_net = np.bincount(seg["net"][segs], km, len(NETWORKS))
    surf = seg["surface"][segs]
    by_surface = np.bincount(surf, km, len(SURFACES))
    way = seg["way"][segs]
    way_km = defaultdict(float)
    for w, d in zip(way.tolist(), km.tolist()):
        if w != connector:
            way_km[way_ids[w]] += d
    return {
        "len": length,
        "score": float((km * seg["score"][segs]).sum()) / length if length else 1.0,
        "km": {k: float(by_net[i]) for i, k in enumerate(NETWORKS)},
        "surface_km": {SURFACES[i]: float(by_surface[i]) for i in np.unique(surf)},
        "tagged_km": float(km[seg["tagged"][segs]].sum()),
        "way_km": dict(way_km),
    }
