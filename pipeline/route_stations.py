"""Train stations along the signed routes, for the route shelf on New trip.

Usage: python route_stations.py <data_dir>

Reads the network and places of a built dataset and writes
<data_dir>/route-stations.json. Adds it to manifest.json.

Sections of a route count as one route, under the clean name of
packages/planner/src/generate/routeCatalog.ts. Each route gets one main line:
the longest path through its edges, with nearby parts joined on. Stations
count by their distance to that line.
"""

import heapq
import json
import math
import os
import re
import sys
from collections import defaultdict

import export as X
import lines as L

MIN_KM = 50
CLASSES = ("icn", "ncn", "rcn")
STATION_KM = 2.0
# Parts of a route with ends this close are joined into one line.
JOIN_KM = 5.0
# Parts shorter than this are branches or bits, not part of the main line.
MIN_PART_KM = 5.0
# Simplified line for the map: points kept when more than this off the line.
LINE_TOLERANCE_KM = 0.3

# Same rules as routeCatalog.ts. Tested on the same cases.
NOT_A_ROUTE = [
    re.compile(r"\(\d+\).*-.*\(\d+\)"),
    re.compile(r"^\d+\s*-\s*\d+$"),
    re.compile(r"^.{1,4}$"),
    re.compile(r"Rad(verkehrs|routen|wege|wegweisungs)?netz", re.I),
    re.compile(r"^D-Netz"),
    re.compile(r"^legacy:"),
    re.compile(r"Zubringer|Abstecher", re.I),
    re.compile(r"Landkreis"),
]
SECTION = [
    re.compile(r"\s*[\[(].*$"),
    re.compile(r"\s+-\s+(part|Abschnitt|Teilstrecke|Etappe)\b.*$", re.I),
    re.compile(r",?\s+(\d+\.\s+)?(Abschnitte?|Teil\s?\d|Etappe)\b.*$"),
    re.compile(r",?\s+(Hauptroute|Hauptweg|Nebenroute|Alternative|Variante)$", re.I),
    re.compile(r"\s+-\s+(Baden-Württemberg|Bayern|Brandenburg|Hessen|Niedersachsen|NRW|Sachsen|Thüringen)$"),
    re.compile(r"\s+(links|rechts)elbisch.*$"),
]


def clean_name(name):
    """The name riders know a route by, the same for all its sections. None if it is no route."""
    ev = re.match(r"^(?:euro\s?velo|ev)\s?(\d+)\b", name, re.I)
    if ev:
        return f"EuroVelo {ev.group(1)}"
    if any(p.search(name) for p in NOT_A_ROUTE):
        return None
    clean = re.sub(r"^(\[D\d+\]\s*|D-Route \d+ - |D\d+ )", "", name, count=1)
    in_sections = "[" in clean
    for s in SECTION:
        clean = s.sub("", clean, count=1)
    if in_sections:
        clean = re.sub(r"\s+\d+$", "", clean, count=1)
    clean = clean.strip()
    return clean if len(clean) > 4 else None


def dist_km(a, b):
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = math.radians(b[1] - a[1])
    return 6371.0 * math.hypot(x, y)


def shortest(adj, start):
    """Dijkstra from start. Returns (dist, prev)."""
    dist, prev = {start: 0.0}, {}
    heap = [(0.0, start)]
    while heap:
        d, n = heapq.heappop(heap)
        if d > dist[n]:
            continue
        for m, km, e in adj[n]:
            nd = d + km
            if nd < dist.get(m, math.inf):
                dist[m], prev[m] = nd, (n, e)
                heapq.heappush(heap, (nd, m))
    return dist, prev


def main_paths(edges):
    """Per connected part, the path between its two ends: [(edge, forward), ...] and its km.

    The ends are the two nodes farthest apart in a straight line, found in two
    sweeps. The path between them is the shortest. So a route on both banks of
    a river follows one bank, and a loop gives half of it."""
    adj, at = defaultdict(list), {}
    for e in edges:
        adj[e["from"]].append((e["to"], e["lengthKm"], e))
        adj[e["to"]].append((e["from"], e["lengthKm"], e))
        pts = L.decode(e["geometry"])
        at[e["from"]], at[e["to"]] = pts[0], pts[-1]
    seen, parts = set(), []
    for start in adj:
        if start in seen:
            continue
        dist, _ = shortest(adj, start)
        seen.update(dist)
        a = max(dist, key=lambda n: dist_km(at[start], at[n]))
        b = max(dist, key=lambda n: dist_km(at[a], at[n]))
        dist, prev = shortest(adj, a)
        path, n = [], b
        while n != a:
            p, e = prev[n]
            path.append((e, e["from"] == p))
            n = p
        path.reverse()
        parts.append((path, dist[b]))
    return parts


def path_points(path):
    """[lon, lat] points of a path, in its direction."""
    pts = []
    for e, forward in path:
        c = L.decode(e["geometry"])
        if not forward:
            c.reverse()
        pts.extend(c if not pts else c[1:])
    return pts


def main_lines(edges):
    """Lines of a route, longest first: each the longest part left, with other
    parts joined on at its ends. Each is (points, edges along it as (edge,
    forward), gaps in km)."""
    parts = [(path_points(p), p, km) for p, km in main_paths(edges) if km >= MIN_PART_KM]
    parts.sort(key=lambda t: -t[2])
    out = []
    while parts:
        out.append(join(parts))
    return out


def join(parts):
    """Takes the first part and the parts that join on to it out of parts."""
    pts, path, _ = parts.pop(0)
    pts, path = list(pts), list(path)
    gaps = 0.0
    while parts:
        best = None
        for i, (p, _, _) in enumerate(parts):
            for at_end in (False, True):
                for rev in (False, True):
                    a = pts[-1] if at_end else pts[0]
                    b = p[-1] if rev == at_end else p[0]
                    d = dist_km(a, b)
                    if d <= JOIN_KM and (best is None or d < best[0]):
                        best = (d, i, at_end, rev)
        if not best:
            break
        d, i, at_end, rev = best
        p, sub, _ = parts.pop(i)
        sub = [(e, f != rev) for e, f in (reversed(sub) if rev else sub)]
        p = p[::-1] if rev else p
        if at_end:
            pts, path = pts + p, path + sub
        else:
            pts, path = p + pts, sub + path
        gaps += d
    return pts, path, gaps


def cumulative_km(pts):
    out = [0.0]
    for a, b in zip(pts, pts[1:]):
        out.append(out[-1] + dist_km(a, b))
    return out


def simplify(pts, tol_km):
    """Douglas-Peucker on [lon, lat] points."""
    if len(pts) < 3:
        return pts
    lat0 = math.radians(sum(p[1] for p in pts) / len(pts))
    xy = [(p[0] * 111.32 * math.cos(lat0), p[1] * 110.57) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = xy[i], xy[j]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-9
        far, at = 0.0, -1
        for k in range(i + 1, j):
            d = abs(dy * (xy[k][0] - x1) - dx * (xy[k][1] - y1)) / norm
            if d > far:
                far, at = d, k
        if far > tol_km:
            keep[at] = True
            stack += [(i, at), (at, j)]
    return [p for p, k in zip(pts, keep) if k]


class PointGrid:
    """Points of a line in cells of about 2 km, for nearest lookups."""

    def __init__(self, pts, cell=0.02):
        self.cell, self.pts, self.cells = cell, pts, defaultdict(list)
        for i, p in enumerate(pts):
            self.cells[(int(p[0] // cell), int(p[1] // cell))].append(i)

    def nearest(self, p, max_km):
        cx, cy = int(p[0] // self.cell), int(p[1] // self.cell)
        r = 1 + int(max_km / (self.cell * 70))
        best = None
        for x in range(cx - r, cx + r + 1):
            for y in range(cy - r, cy + r + 1):
                for i in self.cells.get((x, y), ()):
                    d = dist_km(p, self.pts[i])
                    if d <= max_km and (best is None or d < best[0]):
                        best = (d, i)
        return best


def densify(pts, step_km=0.2):
    """Points at most step_km apart, so a station finds its spot on a long straight edge."""
    out = pts[:1]
    for a, b in zip(pts, pts[1:]):
        n = int(dist_km(a, b) / step_km)
        for k in range(1, n + 1):
            out.append([a[0] + (b[0] - a[0]) * k / (n + 1), a[1] + (b[1] - a[1]) * k / (n + 1)])
        out.append(b)
    return out


def stats(path):
    """Ascent (mean of both ways) and km-weighted scenery of a path."""
    ascent = sum((e["ascent"] + e["descent"]) / 2 for e, _ in path)
    scenery = defaultdict(float)
    seen_km = 0.0
    for e, _ in path:
        s = e.get("scenery")
        if not s:
            continue
        seen_km += e["lengthKm"]
        for k in ("forest", "water", "vineyard", "nature"):
            scenery[k] += s[k] * e["lengthKm"]
        scenery["sights"] += e["lengthKm"] if s["sights"] > 0 else 0.0
    out = {"ascent": round(ascent)}
    if seen_km:
        out["scenery"] = {k: round(v / seen_km, 3) for k, v in sorted(scenery.items())}
    return out


def build(edges, stations, routes_table):
    """Routes of MIN_KM or more, with their stations. `routes_table` as in routes.json."""
    network = {}
    for r in routes_table:
        name = clean_name(r["name"])
        if name and (name not in network or L.CLASS_ORDER.index(r["network"]) < L.CLASS_ORDER.index(network[name])):
            network[name] = r["network"]
    by_route = defaultdict(dict)
    for e in edges:
        for raw in e["routes"]:
            name = clean_name(raw)
            if name and network.get(name) in CLASSES:
                by_route[name][e["id"]] = e

    station_grid = defaultdict(list)
    for s in stations:
        station_grid[(int(s["lon"] // 0.1), int(s["lat"] // 0.1))].append(s)

    out = []
    for name in sorted(by_route):
        es = list(by_route[name].values())
        if sum(e["lengthKm"] for e in es) < MIN_KM:
            continue
        parts = []
        for pts, path, gaps in main_lines(es):
            km = sum(e["lengthKm"] for e, _ in path) + gaps
            if km >= MIN_KM:
                parts.append(part(pts, path, km, station_grid))
        if parts:
            out.append({"name": name, "network": network[name], "parts": parts})
    return out


def part(pts, path, km, station_grid):
    """One line of a route with its stations in order, as km along it. Starts at its south-west end."""
    if pts[0][0] + pts[0][1] > pts[-1][0] + pts[-1][1]:
        pts = pts[::-1]
    dense = densify(pts)
    along = cumulative_km(dense)
    scale = km / (along[-1] or 1.0)
    grid = PointGrid(dense)
    lons, lats = [p[0] for p in pts], [p[1] for p in pts]
    found = []
    for x in range(int(min(lons) // 0.1) - 1, int(max(lons) // 0.1) + 2):
        for y in range(int(min(lats) // 0.1) - 1, int(max(lats) // 0.1) + 2):
            for s in station_grid.get((x, y), ()):
                hit = grid.nearest([s["lon"], s["lat"]], STATION_KM)
                if hit:
                    found.append((round(along[hit[1]] * scale, 1), s["id"]))
    found.sort()
    return {
        "lengthKm": round(km, 1),
        **stats(path),
        "bbox": [round(min(lons), 4), round(min(lats), 4), round(max(lons), 4), round(max(lats), 4)],
        "line": X.encode(simplify(pts, LINE_TOLERANCE_KM)),
        "stations": [[sid, km] for km, sid in found],
    }


def write_into(data_dir):
    with open(os.path.join(data_dir, "manifest.json")) as f:
        manifest = json.load(f)
    edges = L.load_edges(data_dir, manifest)
    stations = X.read_places(data_dir)["stations"]
    with open(os.path.join(data_dir, manifest["files"]["routes"])) as f:
        table = json.load(f)["routes"]
    routes = build(edges, stations, table)
    path = os.path.join(data_dir, "route-stations.json")
    with open(path, "w") as f:
        json.dump({"version": manifest["version"], "routes": routes}, f, ensure_ascii=False, separators=(",", ":"))
    manifest["files"]["routeStations"] = "route-stations.json"
    with open(os.path.join(data_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
    parts = [p for r in routes for p in r["parts"]]
    return {"routes": len(routes), "parts": len(parts), "stations": sum(len(p["stations"]) for p in parts), "bytes": os.path.getsize(path)}


if __name__ == "__main__":
    s = write_into(sys.argv[1])
    print(f"route stations: {s['routes']} routes, {s['parts']} parts, {s['stations']} stations, {s['bytes'] / 1024:.0f} KiB")
