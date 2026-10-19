"""Build the route network graph from the extracted OSM data (docs/05)."""

import math
from collections import defaultdict

SNAP_KM = 1.5  # towns and stations within this distance get a node
HOTEL_KM = 2.0  # a hotel counts for the nearest town within this distance
GAP_KM = 1.0  # dead ends get an unsigned connector to another component within this distance
CONNECTOR_DETOUR = 1.3  # connector length = straight line x this

NETWORK_RANK = {"icn": 0, "ncn": 1, "rcn": 2, "lcn": 3, "other": 4, "connector": 5}
NETWORK_SCORE = {"icn": 1.0, "ncn": 0.95, "rcn": 0.85, "lcn": 0.75, "other": 0.7, "connector": 0.4}

PAVED = {"asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "chipseal", "sett", "metal", "wood"}
GOOD_UNPAVED = {"compacted", "fine_gravel"}
MAIN_ROADS = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"}
ROADS = MAIN_ROADS | {"tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service", "road"}


def dist_km(a, b):
    """Equirectangular distance between two [lon, lat] points."""
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = math.radians(b[1] - a[1])
    return 6371.0 * math.hypot(x, y)


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


def build(data):
    # Best network and names per way.
    way_net = {}
    way_routes = defaultdict(set)
    for r in data["routes"]:
        for wid in r["ways"]:
            w = str(wid)
            if w not in data["ways"]:
                continue
            way_routes[w].add(r["name"])
            if w not in way_net or NETWORK_RANK[r["network"]] < NETWORK_RANK[way_net[w]]:
                way_net[w] = r["network"]

    # Fine graph on OSM nodes.
    coord = {}
    seg = {}  # (a, b) with a < b -> attributes
    adj = defaultdict(set)
    for wid, w in data["ways"].items():
        surf, tagged = surface_class(w)
        net = way_net[wid]
        for i in range(len(w["nodes"]) - 1):
            a, b = w["nodes"][i], w["nodes"][i + 1]
            if a == b:
                continue
            coord[a], coord[b] = w["coords"][i], w["coords"][i + 1]
            key = (min(a, b), max(a, b))
            attrs = {
                "len": dist_km(w["coords"][i], w["coords"][i + 1]),
                "net": net,
                "surface": surf,
                "tagged": tagged,
                "highway": w["highway"],
                "way": wid,
            }
            old = seg.get(key)
            if old is None or NETWORK_RANK[net] < NETWORK_RANK[old["net"]]:
                seg[key] = attrs
            adj[a].add(b)
            adj[b].add(a)

    grid = Grid()
    for n, c in coord.items():
        grid.add(n, c)

    comp = components(adj)
    stats = {"fine_nodes": len(coord), "components_before": len(set(comp.values()))}

    # Unsigned connectors from dead ends to the nearest node of another component.
    connectors = 0
    for n in [n for n in adj if len(adj[n]) == 1]:
        for d, m, _ in grid.near(coord[n], GAP_KM):
            if comp[m] != comp[n]:
                key = (min(n, m), max(n, m))
                seg[key] = {
                    "len": d * CONNECTOR_DETOUR,
                    "net": "connector",
                    "surface": "unknown",
                    "tagged": False,
                    "highway": None,
                    "way": None,
                }
                adj[n].add(m)
                adj[m].add(n)
                connectors += 1
                break
    comp = components(adj)
    sizes = defaultdict(int)
    for c in comp.values():
        sizes[c] += 1
    main_comp = max(sizes, key=sizes.get)
    stats.update(
        connectors=connectors,
        components_after=len(sizes),
        main_component_share=sizes[main_comp] / len(comp),
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
    towns = []
    for p in data["places"]:
        near = grid.near(p["loc"], SNAP_KM)
        if not near:
            continue
        d, n, _ = near[0]
        towns.append({**p, "node": n, "snap_km": d, "hotels": hotels_at[p["id"]], "main": comp[n] == main_comp})
    stations = []
    for s in data["stations"]:
        near = grid.near(s["loc"], SNAP_KM)
        if near:
            d, n, _ = near[0]
            stations.append({**s, "node": n, "snap_km": d, "main": comp[n] == main_comp})

    key_nodes = {n for n in adj if len(adj[n]) != 2}
    key_nodes |= {t["node"] for t in towns} | {s["node"] for s in stations}

    edges = compress(adj, seg, coord, key_nodes)
    for e in edges:
        route_km = defaultdict(float)
        for wid, km in e.pop("way_km").items():
            for name in way_routes[wid]:
                route_km[name] += km
        e["routes"] = dict(route_km)
    graph = defaultdict(list)
    for i, e in enumerate(edges):
        graph[e["a"]].append((e["b"], i))
        graph[e["b"]].append((e["a"], i))

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


def compress(adj, seg, coord, key_nodes):
    """Turn chains of OSM nodes between key nodes into edges."""
    edges = []
    seen = set()
    for a in key_nodes:
        for first in adj[a]:
            if (a, first) in seen:
                continue
            nodes = [a, first]
            while nodes[-1] not in key_nodes:
                nxt = [m for m in adj[nodes[-1]] if m != nodes[-2]]
                if not nxt:
                    break
                nodes.append(nxt[0])
            for i in range(len(nodes) - 1):
                seen.add((nodes[i], nodes[i + 1]))
                seen.add((nodes[i + 1], nodes[i]))
            edges.append(make_edge(nodes, seg, coord))
    return edges


def make_edge(nodes, seg, coord):
    km = defaultdict(float)
    length = 0.0
    surface_km = defaultdict(float)
    tagged_km = 0.0
    weighted = 0.0
    way_km = defaultdict(float)
    for i in range(len(nodes) - 1):
        a, b = nodes[i], nodes[i + 1]
        s = seg[(min(a, b), max(a, b))]
        length += s["len"]
        km[s["net"]] += s["len"]
        surface_km[s["surface"]] += s["len"]
        if s["tagged"]:
            tagged_km += s["len"]
        weighted += s["len"] * segment_score(s["net"], s["surface"], s["highway"])
        if s["way"]:
            way_km[s["way"]] += s["len"]
    return {
        "a": nodes[0],
        "b": nodes[-1],
        "coords": [coord[n] for n in nodes],
        "len": length,
        "score": weighted / length if length else 1.0,
        "km": {k: km.get(k, 0.0) for k in NETWORK_SCORE},
        "surface_km": dict(surface_km),
        "tagged_km": tagged_km,
        "way_km": dict(way_km),
    }
