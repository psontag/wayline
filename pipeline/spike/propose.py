"""Search trip proposals on the route network. Writes GPX files and a report.

Usage: python propose.py <extract.json> <dem_dir> <output_dir>
"""

import heapq
import json
import math
import os
import sys
import unicodedata
from collections import defaultdict
from xml.sax.saxutils import escape

import graph as G
from dem import Dem

K = 2  # cost = length / score^K
REUSE_PENALTY = 5  # edges already used in this proposal
VARIETY_PENALTY = 2  # edges used by earlier proposals
LENGTH_TOLERANCE = 0.08
STOP_KM = 2.0  # max distance from track to a stop town
PROPOSALS = 3
MAX_SHARED = 0.4  # max share of a proposal on edges of earlier proposals
MAX_TRIES = 300

CASES = [
    {"id": "A", "kind": "one-way", "days": 4, "km_per_day": 80, "start": "Bamberg"},
    {"id": "B", "kind": "multi-day-loop", "days": 3, "km_per_day": 70, "start": "Bamberg"},
]


# --- search ---------------------------------------------------------------


def dijkstra(g, src, penalty, dst=None):
    cost, length, prev = {src: 0.0}, {src: 0.0}, {}
    pq = [(0.0, src)]
    while pq:
        c, n = heapq.heappop(pq)
        if c > cost[n]:
            continue
        if n == dst:
            break
        for m, ei in g["graph"][n]:
            e = g["edges"][ei]
            nc = c + e["len"] / e["score"] ** K * penalty.get(ei, 1)
            if nc < cost.get(m, math.inf):
                cost[m], length[m], prev[m] = nc, length[n] + e["len"], (n, ei)
                heapq.heappush(pq, (nc, m))
    return cost, length, prev


def shortest_path(g, src, dst, penalty):
    """List of (edge index, forward) from src to dst."""
    _, _, prev = dijkstra(g, src, penalty, dst)
    if dst not in prev and src != dst:
        return None
    out, n = [], dst
    while n != src:
        p, ei = prev[n]
        out.append((ei, g["edges"][ei]["a"] == p))
        n = p
    return out[::-1]


def legs_to_path(g, legs, penalty):
    """Chain shortest paths through the given nodes. Each leg avoids edges of earlier legs."""
    local = dict(penalty)
    steps = []
    for a, b in zip(legs, legs[1:]):
        p = shortest_path(g, a, b, local)
        if p is None:
            return None
        for ei, _ in p:
            local[ei] = local.get(ei, 1) * REUSE_PENALTY
        steps += p
    return steps


def bearing(a, b):
    return math.degrees(math.atan2(b[0] - a[0], (b[1] - a[1]) / math.cos(math.radians(a[1])))) % 360


def angle_diff(a, b):
    return abs((a - b + 180) % 360 - 180)


def search_one_way(g, start, case, penalty):
    """start -> V -> end station. The via town V stretches the trip to the target length."""
    total = case["days"] * case["km_per_day"]
    s = start["node"]
    cs, ls, _ = dijkstra(g, s, {})
    town_nodes = {t["node"] for t in g["towns"] if t["main"]}
    candidates = []
    for end in g["stations"]:
        if not end["main"] or G.dist_km(start["loc"], end["loc"]) < 40:
            continue
        ce, le, _ = dijkstra(g, end["node"], {})
        # Prefer ends far from the start, so the trip goes somewhere.
        far = min(G.dist_km(start["loc"], end["loc"]), 100) / 100
        for v in town_nodes | {end["node"]}:
            if v in ls and v in le and abs(ls[v] + le[v] - total) < 0.1 * total:
                est = ls[v] + le[v]
                q = (cs[v] + ce[v]) / est * (1 + abs(est - total) / total) * (1.5 - 0.5 * far)
                candidates.append((q, [s, v, end["node"]], end))
    return pick(g, candidates, start, total, penalty)


def search_loop(g, start, case, penalty):
    """Triangle loop: start -> A -> B -> start, with A and B at about 1/3 of the length."""
    total = case["days"] * case["km_per_day"]
    s = start["node"]
    cs, ls, _ = dijkstra(g, s, {})
    ring = list({t["node"] for t in g["towns"] if t["main"] and 0.25 * total <= ls.get(t["node"], 0) <= 0.42 * total})
    candidates = []
    for i, a in enumerate(ring):
        for b in ring[i + 1 :]:
            est = ls[a] + ls[b] + 1.3 * G.dist_km(g["coord"][a], g["coord"][b])
            if abs(est - total) < 0.1 * total:
                q = (cs[a] + cs[b]) / (ls[a] + ls[b]) * (1 + abs(est - total) / total)
                candidates.append((q, [s, a, b, s], start))
    return pick(g, candidates, start, total, penalty)


def pick(g, candidates, start, total, penalty):
    """Best candidates first. Skip those that share too much with earlier picks."""
    candidates.sort(key=lambda c: c[0])
    picks, used, tries = [], set(), 0
    for _, nodes, end in candidates:
        if len(picks) == PROPOSALS or tries == MAX_TRIES:
            break
        if any(G.dist_km(g["coord"][nodes[1]], g["coord"][p["via"][0]]) < 10 for p in picks):
            continue
        tries += 1
        steps = legs_to_path(g, nodes, penalty)
        if not steps or not accept(g, steps, total):
            continue
        length = sum(g["edges"][ei]["len"] for ei, _ in steps)
        shared = sum(g["edges"][ei]["len"] for ei in {ei for ei, _ in steps} & used)
        if shared > MAX_SHARED * length:
            continue
        picks.append({"start": start, "end": end, "via": nodes[1:-1], "steps": steps, "shared": shared / length})
        used |= {ei for ei, _ in steps}
        for ei, _ in steps:
            penalty[ei] = penalty.get(ei, 1) * VARIETY_PENALTY
    return picks


def accept(g, steps, total):
    length = sum(g["edges"][ei]["len"] for ei, _ in steps)
    return abs(length - total) <= LENGTH_TOLERANCE * total and reused_km(g, steps) < 0.1 * length


def reused_km(g, steps):
    seen, km = set(), 0.0
    for ei, _ in steps:
        if ei in seen:
            km += g["edges"][ei]["len"]
        seen.add(ei)
    return km


# --- stages ---------------------------------------------------------------


def geometry(g, p):
    """Track points [lon, lat] with km from start, including station access."""
    pts = [p["start"]["loc"]]
    for ei, fwd in p["steps"]:
        c = g["edges"][ei]["coords"]
        pts += c if fwd else c[::-1]
    pts.append(p["end"]["loc"])
    km = [0.0]
    for a, b in zip(pts, pts[1:]):
        km.append(km[-1] + G.dist_km(a, b))
    return pts, km


def cut_stages(g, pts, km, days, target):
    total = km[-1]
    grid = G.Grid()
    for i, pt in enumerate(pts):
        grid.add(i, pt)
    cands = []
    for t in g["towns"]:
        if t["hotels"] == 0:
            continue
        near = grid.near(t["loc"], STOP_KM)
        if near:
            d, i, _ = near[0]
            if 0.4 * target < km[i] < total - 0.4 * target:
                cands.append({"town": t, "idx": i, "km": km[i], "off_km": d})
    cands.sort(key=lambda c: c["km"])

    def stage_cost(length):
        return ((length - target) / target) ** 2

    def stop_cost(c):
        # Prefer towns with more hotels (worth about 10 km of stage deviation) and towns on the track.
        return -0.03 * math.log2(1 + min(c["town"]["hotels"], 15)) / 4 + 0.005 * c["off_km"]

    n = days - 1
    best = [[(stage_cost(c["km"]) + stop_cost(c), None) for c in cands]]
    for j in range(1, n):
        row = []
        for i, c in enumerate(cands):
            opts = [
                (best[j - 1][h][0] + stage_cost(c["km"] - cands[h]["km"]) + stop_cost(c), h)
                for h in range(i)
                if cands[h]["km"] < c["km"] - 5
            ]
            row.append(min(opts) if opts else (math.inf, None))
        best.append(row)
    final = [(best[n - 1][i][0] + stage_cost(total - c["km"]), i) for i, c in enumerate(cands)]
    if not final or min(final)[0] == math.inf:
        return None
    _, i = min(final)
    chosen = []
    for j in range(n - 1, -1, -1):
        chosen.append(cands[i])
        i = best[j][i][1]
    chosen.reverse()
    for c in chosen:
        c["alternatives"] = [
            a for a in sorted(cands, key=lambda a: -a["town"]["hotels"])
            if a is not c and abs(a["km"] - c["km"]) <= 10
        ][:2]
    return chosen


def ascent(dem, pts):
    """Ascent in m. Samples every 50 m and smooths over 450 m to damp DSM noise."""
    samples = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(G.dist_km(a, b) / 0.05))
        for k in range(n):
            f = k / n
            e = dem.elevation(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
            if e is not None:
                samples.append(e)
    w = 4
    smooth = [sum(samples[max(0, i - w) : i + w + 1]) / len(samples[max(0, i - w) : i + w + 1]) for i in range(len(samples))]
    return sum(max(0.0, b - a) for a, b in zip(smooth, smooth[1:]))


def near_repeat_km(pts, km):
    """km of track that runs within 150 m of another part of the track at least 5 km away."""
    grid = G.Grid()
    for i, pt in enumerate(pts):
        grid.add(i, pt)
    out = 0.0
    for i in range(1, len(pts)):
        if any(abs(km[j] - km[i]) > 5 for _, j, _ in grid.near(pts[i], 0.15)):
            out += km[i] - km[i - 1]
    return out


# --- stats and output -----------------------------------------------------


def stats(g, steps, access_km):
    km = defaultdict(float)
    surface = defaultdict(float)
    tagged = 0.0
    routes = defaultdict(float)
    connectors = 0
    for ei, _ in steps:
        e = g["edges"][ei]
        for k, v in e["km"].items():
            km[k] += v
        for k, v in e["surface_km"].items():
            surface[k] += v
        tagged += e["tagged_km"]
        for k, v in e["routes"].items():
            routes[k] += v
        if e["km"]["connector"] > 0:
            connectors += 1
    km["access"] = access_km
    total = sum(km.values())
    return {
        "total": total,
        "km": dict(km),
        "signed_share": (total - km["connector"] - access_km) / total,
        "main_share": (km["icn"] + km["ncn"] + km["rcn"]) / total,
        "paved_share": surface["paved"] / total,
        "surface": dict(surface),
        "tagged_share": tagged / total,
        "connectors": connectors,
        "reused_km": reused_km(g, steps),
        "routes": sorted(routes.items(), key=lambda r: -r[1])[:6],
    }


def write_gpx(path, title, stages, waypoints):
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="wayline-spike" xmlns="http://www.topografix.com/GPX/1/1">',
        f"  <metadata><name>{escape(title)}</name></metadata>",
    ]
    for name, loc in waypoints:
        out.append(f'  <wpt lat="{loc[1]}" lon="{loc[0]}"><name>{escape(name)}</name></wpt>')
    out.append(f"  <trk><name>{escape(title)}</name>")
    for seg in stages:
        out.append("    <trkseg>")
        out += [f'      <trkpt lat="{p[1]}" lon="{p[0]}"/>' for p in seg]
        out.append("    </trkseg>")
    out += ["  </trk>", "</gpx>", ""]
    with open(path, "w") as f:
        f.write("\n".join(out))


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return "".join(ch if ch.isalnum() else "-" for ch in s.lower()).strip("-")


def main(src, dem_dir, out_dir):
    with open(src) as f:
        g = G.build(json.load(f))
    dem = Dem(dem_dir)
    os.makedirs(out_dir, exist_ok=True)

    lines = report_header(g)
    for case in CASES:
        start = next(s for s in g["stations"] if s["name"] == case["start"])
        search = search_one_way if case["kind"] == "one-way" else search_loop
        proposals = search(g, start, case, {})
        lines += [f"## Case {case['id']}: {case['kind']}, {case['days']} days, ~{case['km_per_day']} km/day from {case['start']}", ""]
        if len(proposals) < PROPOSALS:
            lines += [f"Only {len(proposals)} proposals found.", ""]
        for n, p in enumerate(proposals, 1):
            lines += render_proposal(g, dem, case, n, p, out_dir)
    with open(os.path.join(out_dir, "report.md"), "w") as f:
        f.write("\n".join(lines))


def report_header(g):
    s = g["stats"]
    return [
        "# Route network spike: Upper Franconia",
        "",
        "Question: do signed cycling routes from OSM give good multi-day trip proposals?",
        "",
        "Generated by `pipeline/spike/propose.py`, except the verdict at the end. "
        "Data: Geofabrik `oberfranken-latest.osm.pbf`, Copernicus GLO-30 DEM.",
        "",
        "## How it works",
        "",
        "- Python 3.12. `pyosmium` reads the PBF (`extract.py`), `tifffile` reads the DEM, the rest is plain Python.",
        "  Python because PBF parsing in Node needs more work and this is throwaway code.",
        "- Graph: OSM nodes on route ways, compressed to edges between junctions, dead ends and nodes snapped to towns and stations.",
        "- Edge score: network (icn 1.0, ncn 0.95, rcn 0.85, lcn 0.75, connector 0.4)"
        " x surface (paved 1.0, gravel/unknown 0.85, rough 0.6) x 0.7 on primary/secondary roads.",
        "- Search: Dijkstra with cost = length / score². One-way: start -> via town -> end station. "
        "Loop: start -> A -> B -> start with A and B at 25-42 % of the length. "
        "Each leg penalizes edges of earlier legs (x5), each proposal penalizes its edges for later ones (x2), "
        "and a proposal may share at most 40 % with earlier ones.",
        "- Stages: dynamic programming over towns with hotels within 2 km of the track, toward the target km per day. "
        "A hotel counts for its nearest town only.",
        "- Ascent: sampled every 50 m from GLO-30, smoothed over 450 m. Only reported, not used in the search.",
        "- `overview.png` shows all proposals. One color per stage.",
        "",
        "Run:",
        "",
        "```sh",
        "python extract.py oberfranken-latest.osm.pbf extract.json",
        "python propose.py extract.json <dem-dir> output",
        "python plot.py extract.json output",
        "```",
        "",
        "## Network",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Route km (unique ways in relations) | {s['route_km']:.0f} |",
        f"| Graph nodes / edges | {s['nodes']} / {s['edges']} |",
        f"| Components before gap fixing | {s['components_before']} |",
        f"| Unsigned connectors added (dead end to other component, ≤ {G.GAP_KM:g} km) | {s['connectors']} ({s['connector_km']:.1f} km) |",
        f"| Components after | {s['components_after']} |",
        f"| OSM nodes in the main component | {s['main_component_share']:.1%} |",
        f"| Towns within {G.SNAP_KM:g} km of a route | {s['towns_near_routes']} |",
        f"| ... with a hotel within {G.HOTEL_KM:g} km | {s['towns_with_hotels']} |",
        f"| Stations within {G.SNAP_KM:g} km of a route | {s['stations_near_routes']} |",
        "",
    ]


def render_proposal(g, dem, case, n, p, out_dir):
    pts, km = geometry(g, p)
    access = G.dist_km(p["start"]["loc"], pts[1]) + G.dist_km(pts[-2], p["end"]["loc"])
    st = stats(g, p["steps"], access)
    repeat = near_repeat_km(pts, km)
    stops = cut_stages(g, pts, km, case["days"], case["km_per_day"])
    if stops is None:
        return [f"### {case['id']}{n}: no stage cut found", ""]

    cut = [0] + [s["idx"] for s in stops] + [len(pts) - 1]
    segs = [pts[a : b + 1] for a, b in zip(cut, cut[1:])]
    places = [p["start"]["name"]] + [s["town"]["name"] for s in stops] + [p["end"]["name"]]
    title = f"{case['id']}{n} {places[0]} - {places[-1]}" if case["kind"] == "one-way" else f"{case['id']}{n} Loop {places[0]} via {', '.join(places[1:-1])}"
    fname = f"{case['id']}{n}-{slug(places[0])}-{slug(places[-1] if case['kind'] == 'one-way' else places[1])}.gpx"
    wpts = [(f"Start: {places[0]} station", p["start"]["loc"])]
    for i, s in enumerate(stops, 1):
        wpts.append((f"Night {i}: {s['town']['name']} ({s['town']['hotels']} hotels)", s["town"]["loc"]))
    wpts.append((f"End: {places[-1]} station", p["end"]["loc"]))
    write_gpx(os.path.join(out_dir, fname), title, segs, wpts)

    out = [
        f"### {title}",
        "",
        f"File: `{fname}`",
        "",
        f"- Total: **{st['total']:.0f} km** (target {case['days'] * case['km_per_day']} km)",
        f"- Signed routes: {st['signed_share']:.0%}. On icn/ncn/rcn: {st['main_share']:.0%}. "
        f"(icn {st['km']['icn']:.0f}, ncn {st['km']['ncn']:.0f}, rcn {st['km']['rcn']:.0f}, "
        f"lcn {st['km']['lcn']:.0f}, other {st['km']['other']:.0f} km)",
        f"- Unsigned: {st['km']['connector']:.1f} km in {st['connectors']} gap connectors, {access:.1f} km station access",
        f"- Paved: {st['paved_share']:.0%} (gravel {st['surface'].get('gravel', 0) / st['total']:.0%}, "
        f"rough {st['surface'].get('rough', 0) / st['total']:.0%}, unknown {st['surface'].get('unknown', 0) / st['total']:.0%}). "
        f"Surface explicitly tagged on {st['tagged_share']:.0%} of the km.",
        f"- Routes: {', '.join(f'{name} ({k:.0f} km)' for name, k in st['routes'])}",
        f"- Shared with earlier proposals of this case: {p['shared']:.0%}",
        f"- Near itself (within 150 m of a part at least 5 km away): {repeat:.0f} km",
        "",
        "| Day | From | To | km | Ascent (m) | Hotels at stop | Off track | Alternatives |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for i, seg in enumerate(segs):
        a, b = (km[cut[i]], km[cut[i + 1]])
        stop = stops[i] if i < len(stops) else None
        alt = ", ".join(f"{x['town']['name']} ({x['town']['hotels']}, {x['km'] - stop['km']:+.0f} km)" for x in stop["alternatives"]) if stop else ""
        out.append(
            f"| {i + 1} | {places[i]} | {places[i + 1]} | {b - a:.0f} | {ascent(dem, seg):.0f} | "
            f"{stop['town']['hotels'] if stop else '-'} | {f'{stop['off_km']:.1f} km' if stop else '-'} | {alt} |"
        )
    odd = []
    if st["reused_km"] > 0.5:
        odd.append(f"{st['reused_km']:.1f} km on the same edge twice")
    if repeat > 5:
        odd.append(f"{repeat:.0f} km close to another part of the track (back and forth)")
    if access > 2:
        odd.append(f"station access {access:.1f} km is a straight line")
    out += ["", f"Odd: {'; '.join(odd) if odd else 'nothing flagged by the checks'}", ""]
    return out


if __name__ == "__main__":
    main(*sys.argv[1:4])
