import { distanceKm } from "@wayline/domain";
import type { Graph, PathStep } from "../graph/Graph";

/** Max distance from the path to a stop town. */
export const STOP_KM = 2;
/** Max km between a stop and its alternatives. */
const ALTERNATIVE_KM = 10;
const MAX_ALTERNATIVES = 2;
/** Min km between two stops. */
const MIN_GAP_KM = 5;

/** Node on a path with km and ascent from the start. */
export type PathPoint = { node: number; km: number; ascent: number };

/** Nodes along a path. The first point is the start node. */
export function pathPoints(
  graph: Graph,
  start: number,
  steps: PathStep[],
): PathPoint[] {
  const out: PathPoint[] = [{ node: start, km: 0, ascent: 0 }];
  let node = start;
  let km = 0;
  let ascent = 0;
  for (const { edge, forward } of steps) {
    const e = graph.edge(edge);
    node = graph.other(edge, node);
    km += e.lengthKm;
    ascent += forward ? e.ascent : e.descent;
    out.push({ node, km, ascent });
  }
  return out;
}

/** Stop candidate: a town with hotels near the path. */
export type StopCandidate = {
  node: number;
  /** Index into the path points where the stage ends. */
  index: number;
  km: number;
  offKm: number;
  hotels: number;
};

export type Stop = StopCandidate & { alternatives: StopCandidate[] };

export type CutOptions = {
  days: number;
  kmPerDay: number;
  maxAscentPerDay: number;
};

/**
 * Collects towns with hotels within STOP_KM of the path. Each town sits at
 * its nearest path node.
 */
export function stopCandidates(
  graph: Graph,
  points: PathPoint[],
  hotelNodes: number[],
  hotelCount: (node: number) => number,
): StopCandidate[] {
  const total = points.at(-1)?.km ?? 0;
  const last = points.length - 1;
  // Degrees per km, for a cheap prefilter before the real distance.
  const dLat = STOP_KM / 110;
  const dLon = STOP_KM / 70;
  const out: StopCandidate[] = [];
  for (const node of hotelNodes) {
    const c = graph.coord(node);
    let best: { index: number; d: number } | undefined;
    for (const [index, p] of points.entries()) {
      if (index === 0 || index === last) continue;
      const pc = graph.coord(p.node);
      if (Math.abs(pc[1] - c[1]) > dLat || Math.abs(pc[0] - c[0]) > dLon)
        continue;
      const d = p.node === node ? 0 : distanceKm(c, pc);
      if (d <= STOP_KM && (!best || d < best.d)) best = { index, d };
    }
    if (!best) continue;
    const km = points[best.index]?.km ?? 0;
    if (km <= 0 || km >= total) continue;
    out.push({
      node,
      index: best.index,
      km,
      offKm: best.d,
      hotels: hotelCount(node),
    });
  }
  return out.sort((a, b) => a.km - b.km || a.offKm - b.offKm);
}

/** Cost of one stage: deviation from the target, plus too much ascent. */
export function stageCost(km: number, ascent: number, o: CutOptions): number {
  const dev = (km - o.kmPerDay) / o.kmPerDay;
  const over = Math.max(0, ascent - o.maxAscentPerDay) / o.maxAscentPerDay;
  return dev * dev + 2 * over * over;
}

/** Prefer towns with more hotels (about 10 km of deviation) and on the path. */
function stopCost(c: StopCandidate): number {
  const hotels =
    c.hotels > 0 ? Math.log2(1 + Math.min(c.hotels, 15)) / 4 : -0.5;
  return -0.03 * hotels + 0.005 * c.offKm;
}

/**
 * Chooses days − 1 stops by dynamic programming. Returns null if no cut
 * works. Each stop keeps up to two alternatives.
 */
export function cutStages(
  points: PathPoint[],
  candidates: StopCandidate[],
  o: CutOptions,
): Stop[] | null {
  const n = o.days - 1;
  if (n <= 0) return [];
  const total = points.at(-1)?.km ?? 0;
  const totalAscent = points.at(-1)?.ascent ?? 0;
  const cands = candidates.filter(
    (c) => c.km > 0.4 * o.kmPerDay && c.km < total - 0.4 * o.kmPerDay,
  );
  const ascentAt = (c: StopCandidate) => points[c.index]?.ascent ?? 0;

  // best[j][i]: cheapest cost with stop j at candidate i, and the previous one.
  const best: { cost: number; prev: number }[][] = [
    cands.map((c) => ({
      cost: stageCost(c.km, ascentAt(c), o) + stopCost(c),
      prev: -1,
    })),
  ];
  for (let j = 1; j < n; j++) {
    const before = best[j - 1] ?? [];
    best.push(
      cands.map((c, i) => {
        let row = { cost: Infinity, prev: -1 };
        for (let h = 0; h < i; h++) {
          const p = cands[h];
          const b = before[h];
          if (!p || !b || p.km >= c.km - MIN_GAP_KM || b.cost === Infinity)
            continue;
          const cost =
            b.cost +
            stageCost(c.km - p.km, ascentAt(c) - ascentAt(p), o) +
            stopCost(c);
          if (cost < row.cost) row = { cost, prev: h };
        }
        return row;
      }),
    );
  }

  let end = -1;
  let endCost = Infinity;
  for (const [i, c] of cands.entries()) {
    const b = best[n - 1]?.[i];
    if (!b || b.cost === Infinity) continue;
    const cost = b.cost + stageCost(total - c.km, totalAscent - ascentAt(c), o);
    if (cost < endCost) [end, endCost] = [i, cost];
  }
  if (end < 0) return null;

  const chosen: StopCandidate[] = [];
  for (let j = n - 1, i = end; j >= 0 && i >= 0; j--) {
    const c = cands[i];
    if (c) chosen.unshift(c);
    i = best[j]?.[i]?.prev ?? -1;
  }
  const taken = new Set(chosen.map((c) => c.node));
  return chosen.map((c) => ({
    ...c,
    alternatives: cands
      .filter(
        (a) =>
          !taken.has(a.node) &&
          a.hotels > 0 &&
          Math.abs(a.km - c.km) <= ALTERNATIVE_KM,
      )
      .sort((a, b) => b.hotels - a.hotels || a.offKm - b.offKm)
      .slice(0, MAX_ALTERNATIVES),
  }));
}
