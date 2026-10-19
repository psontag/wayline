import { type BBox, distanceKm, type Profile } from "@wayline/domain";
import { dijkstra, type EdgeCost, shortestPath } from "../graph/dijkstra";
import type { Graph, PathStep } from "../graph/Graph";

/** cost = length / score^k. A higher k prefers nicer edges more. */
export const SCORE_POWER: Record<Profile, number> = {
  fast: 1,
  touring: 2,
  quiet: 2.5,
  scenic: 3,
};

/** Edges already used in this proposal. */
const REUSE_PENALTY = 5;
/** Edges used by earlier proposals. */
export const VARIETY_PENALTY = 2;
/** Max length deviation of a path from the target. */
const LENGTH_TOLERANCE = 0.08;
/** Max share of a path on edges used twice. */
const MAX_REUSED = 0.1;

/** Ordered candidate: nodes to chain with shortest paths. */
export type Candidate = { quality: number; nodes: number[] };

/** Base edge costs plus a penalty factor per edge. */
export class Costs {
  readonly base: Float64Array;
  readonly penalty: Float64Array;

  constructor(graph: Graph, profile: Profile, region?: BBox) {
    const k = SCORE_POWER[profile];
    const inside = (n: number) => {
      if (!region) return true;
      const { lon, lat } = graph.node(n);
      return (
        lon >= region[0] &&
        lat >= region[1] &&
        lon <= region[2] &&
        lat <= region[3]
      );
    };
    this.base = Float64Array.from(graph.edges, (e) =>
      inside(e.from) || inside(e.to)
        ? e.lengthKm / Math.pow(Math.max(e.score, 0.05), k)
        : Infinity,
    );
    this.penalty = new Float64Array(graph.edges.length).fill(1);
  }

  /** Cost function with the given penalties. */
  cost(penalty = this.penalty): EdgeCost {
    return (e) => (this.base[e.id] ?? Infinity) * (penalty[e.id] ?? 1);
  }

  /** Cheapest costs and km from a node, without penalties. */
  from(graph: Graph, node: number) {
    return dijkstra(graph, node, { cost: this.cost() });
  }
}

/**
 * Chains shortest paths through the nodes. Each leg avoids the edges of
 * earlier legs. Returns null if a leg is not connected.
 */
export function chainPath(
  graph: Graph,
  nodes: number[],
  costs: Costs,
): PathStep[] | null {
  const local = costs.penalty.slice();
  const cost = costs.cost(local);
  const steps: PathStep[] = [];
  for (const [i, b] of nodes.entries()) {
    const a = nodes[i - 1];
    if (a === undefined || a === b) continue;
    const path = shortestPath(graph, a, b, cost);
    if (!path) return null;
    for (const s of path) local[s.edge] = (local[s.edge] ?? 1) * REUSE_PENALTY;
    steps.push(...path);
  }
  return removeSpurs(steps);
}

/** Drops out-and-back parts: a step right after the same edge backwards. */
export function removeSpurs(steps: PathStep[]): PathStep[] {
  const out: PathStep[] = [];
  for (const s of steps) {
    const top = out.at(-1);
    if (top && top.edge === s.edge && top.forward !== s.forward) out.pop();
    else out.push(s);
  }
  return out;
}

export function pathKm(graph: Graph, steps: PathStep[]): number {
  let km = 0;
  for (const s of steps) km += graph.edge(s.edge).lengthKm;
  return km;
}

/** km on edges used more than once. */
export function reusedKm(graph: Graph, steps: PathStep[]): number {
  const seen = new Set<number>();
  let km = 0;
  for (const s of steps) {
    if (seen.has(s.edge)) km += graph.edge(s.edge).lengthKm;
    seen.add(s.edge);
  }
  return km;
}

/** Is the path length close to the target and free of much back and forth? */
export function acceptable(graph: Graph, steps: PathStep[], totalKm: number) {
  const km = pathKm(graph, steps);
  return (
    Math.abs(km - totalKm) <= LENGTH_TOLERANCE * totalKm &&
    reusedKm(graph, steps) < MAX_REUSED * km
  );
}

/**
 * One-way: start → via town → end station. The via town stretches the
 * trip to the target length. Best candidates first. Ends closer than
 * minKm in a straight line are skipped.
 */
export function oneWayCandidates(
  graph: Graph,
  costs: Costs,
  start: number,
  ends: number[],
  vias: number[],
  totalKm: number,
  minKm = Math.min(40, totalKm / 4),
): Candidate[] {
  const fromStart = costs.from(graph, start);
  const startCoord = graph.coord(start);
  const out: Candidate[] = [];
  for (const end of ends) {
    const straight = distanceKm(startCoord, graph.coord(end));
    if (straight < minKm || straight > totalKm) continue;
    if (fromStart.cost[end] === Infinity) continue;
    const fromEnd = costs.from(graph, end);
    // Prefer ends far from the start, so the trip goes somewhere.
    const far = Math.min(straight, 100) / 100;
    for (const v of [...vias, end]) {
      const ls = fromStart.km[v] ?? Infinity;
      const le = fromEnd.km[v] ?? Infinity;
      const est = ls + le;
      if (!(Math.abs(est - totalKm) < 0.1 * totalKm)) continue;
      const cost = (fromStart.cost[v] ?? 0) + (fromEnd.cost[v] ?? 0);
      const quality =
        (cost / est) *
        (1 + Math.abs(est - totalKm) / totalKm) *
        (1.5 - 0.5 * far);
      out.push({ quality, nodes: [start, v, end] });
    }
  }
  return out.sort((a, b) => a.quality - b.quality);
}

/**
 * Multi-day loop: start → A → B → start, with A and B at about a third of
 * the length. Best candidates first.
 */
export function loopCandidates(
  graph: Graph,
  costs: Costs,
  start: number,
  vias: number[],
  totalKm: number,
): Candidate[] {
  const fromStart = costs.from(graph, start);
  const ring = vias.filter((n) => {
    const km = fromStart.km[n] ?? Infinity;
    return km >= 0.25 * totalKm && km <= 0.42 * totalKm;
  });
  const out: Candidate[] = [];
  for (const [i, a] of ring.entries()) {
    const ka = fromStart.km[a] ?? 0;
    const ca = graph.coord(a);
    for (const b of ring.slice(i + 1)) {
      const kb = fromStart.km[b] ?? 0;
      const est = ka + kb + 1.3 * distanceKm(ca, graph.coord(b));
      if (!(Math.abs(est - totalKm) < 0.1 * totalKm)) continue;
      const cost = (fromStart.cost[a] ?? 0) + (fromStart.cost[b] ?? 0);
      const quality =
        (cost / (ka + kb)) * (1 + Math.abs(est - totalKm) / totalKm);
      out.push({ quality, nodes: [start, a, b, start] });
    }
  }
  return out.sort((a, b) => a.quality - b.quality);
}
