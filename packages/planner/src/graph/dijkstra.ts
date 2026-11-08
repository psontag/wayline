import type { NetworkEdge } from "@wayline/domain";
import FlatQueue from "flatqueue";
import type { Graph, PathStep } from "./Graph";

/** Cost of using an edge. Infinity blocks it. */
export type EdgeCost = (edge: NetworkEdge) => number;

/**
 * Cost per edge id: base × factor × extra. Much faster than an EdgeCost,
 * which the search calls once per edge.
 */
export type EdgeWeights = {
  base: Float64Array;
  factor?: Float64Array;
  extra?: Float64Array;
};

/** Prefer nice edges: length / score². */
export const defaultCost: EdgeCost = (e) => e.lengthKm / (e.score * e.score);

export type DijkstraResult = {
  /** Cost to reach each node. Infinity if not reached. */
  cost: Float64Array;
  /** km to reach each node along the cheapest path. */
  km: Float64Array;
  /** Edge used to reach each node, -1 for none. */
  prevEdge: Int32Array;
};

/**
 * Work done by all Dijkstra runs, for the benchmark (`pnpm bench`). Counts
 * don't depend on machine speed.
 */
export const searchCounts = {
  /** Runs without a target: cheapest paths to every node. */
  oneToAll: 0,
  /** Runs that stop at a target. */
  toTarget: 0,
  /** Nodes taken from the queue. */
  settled: 0,
};

export function resetSearchCounts() {
  searchCounts.oneToAll = 0;
  searchCounts.toTarget = 0;
  searchCounts.settled = 0;
}

/** Buffers for searches whose result is read right away. */
const scratch = new WeakMap<Graph, DijkstraResult>();
const queue = new FlatQueue<number>();

/**
 * Cheapest paths from one node. Stops early at target, once all targets
 * are reached, or when the cost passes maxCost. With reuse, the result
 * lives only until the next search with reuse.
 */
export function dijkstra(
  graph: Graph,
  source: number,
  {
    target,
    targets,
    cost = defaultCost,
    maxCost = Infinity,
    reuse = false,
  }: {
    target?: number;
    targets?: Iterable<number>;
    cost?: EdgeCost | EdgeWeights;
    maxCost?: number;
    reuse?: boolean;
  } = {},
): DijkstraResult {
  const n = graph.nodes.length;
  let result = reuse ? scratch.get(graph) : undefined;
  if (result) {
    result.cost.fill(Infinity);
    result.km.fill(Infinity);
    result.prevEdge.fill(-1);
  } else {
    result = {
      cost: new Float64Array(n).fill(Infinity),
      km: new Float64Array(n).fill(Infinity),
      prevEdge: new Int32Array(n).fill(-1),
    };
    if (reuse) scratch.set(graph, result);
  }
  const { cost: best, km, prevEdge } = result;
  const { adjStart, adjEdge, adjTo, lengthKm } = graph;
  const edgeCost = typeof cost === "function" ? cost : undefined;
  const w = typeof cost === "function" ? undefined : cost;
  const base = w?.base;
  const factor = w?.factor;
  const extra = w?.extra;

  queue.clear();
  best[source] = 0;
  km[source] = 0;
  queue.push(source, 0);
  const open = targets ? new Set(targets) : undefined;
  if (target === undefined && !open) searchCounts.oneToAll++;
  else searchCounts.toTarget++;

  while (queue.length) {
    const c = queue.peekValue() as number;
    const node = queue.pop() as number;
    if (c > (best[node] as number)) continue;
    searchCounts.settled++;
    if (node === target || c > maxCost) break;
    if (open) {
      open.delete(node);
      if (!open.size) break;
    }
    const end = adjStart[node + 1] as number;
    for (let j = adjStart[node] as number; j < end; j++) {
      const id = adjEdge[j] as number;
      const next = adjTo[j] as number;
      let ec: number;
      if (edgeCost) ec = edgeCost(graph.edge(id));
      else {
        ec = base?.[id] ?? Infinity;
        if (factor) ec *= factor[id] ?? 1;
        if (extra) ec *= extra[id] ?? 1;
      }
      const nc = c + ec;
      if (nc < (best[next] as number)) {
        best[next] = nc;
        km[next] = (km[node] as number) + (lengthKm[id] as number);
        prevEdge[next] = id;
        queue.push(next, nc);
      }
    }
  }
  return result;
}

/** Steps from the source of a Dijkstra run to target, or null. */
export function pathTo(
  graph: Graph,
  result: DijkstraResult,
  target: number,
): PathStep[] | null {
  if ((result.cost[target] ?? Infinity) === Infinity) return null;
  const steps: PathStep[] = [];
  let node = target;
  for (
    let id = result.prevEdge[node] ?? -1;
    id >= 0;
    id = result.prevEdge[node] ?? -1
  ) {
    const prev = graph.other(id, node);
    steps.push({ edge: id, forward: graph.edge(id).from === prev });
    node = prev;
  }
  return steps.reverse();
}

/** One side of a bidirectional search. Only touched nodes are reset. */
type Side = {
  cost: Float64Array;
  prevEdge: Int32Array;
  queue: FlatQueue<number>;
  touched: number[];
};

const sides = new WeakMap<Graph, [Side, Side]>();

function sidesOf(graph: Graph): [Side, Side] {
  let s = sides.get(graph);
  if (!s) {
    const n = graph.nodes.length;
    const side = (): Side => ({
      cost: new Float64Array(n).fill(Infinity),
      prevEdge: new Int32Array(n).fill(-1),
      queue: new FlatQueue<number>(),
      touched: [],
    });
    s = [side(), side()];
    sides.set(graph, s);
  }
  return s;
}

function reset(side: Side) {
  for (const n of side.touched) {
    side.cost[n] = Infinity;
    side.prevEdge[n] = -1;
  }
  side.touched.length = 0;
  side.queue.clear();
}

/**
 * Cheapest path between two nodes, or null if they are not connected.
 * Searches from both ends at once. Edges are undirected and cost the same
 * both ways, so the search from `to` uses the same costs.
 */
export function shortestPath(
  graph: Graph,
  from: number,
  to: number,
  cost: EdgeCost | EdgeWeights = defaultCost,
): PathStep[] | null {
  searchCounts.toTarget++;
  if (from === to) return [];
  const { adjStart, adjEdge, adjTo } = graph;
  const edgeCost = typeof cost === "function" ? cost : undefined;
  const w = typeof cost === "function" ? undefined : cost;
  const base = w?.base;
  const factor = w?.factor;
  const extra = w?.extra;
  const weight = (id: number) => {
    if (edgeCost) return edgeCost(graph.edge(id));
    let ec = base?.[id] ?? Infinity;
    if (factor) ec *= factor[id] ?? 1;
    if (extra) ec *= extra[id] ?? 1;
    return ec;
  };

  const [fwd, bwd] = sidesOf(graph);
  reset(fwd);
  reset(bwd);
  for (const [side, node] of [
    [fwd, from],
    [bwd, to],
  ] as const) {
    side.cost[node] = 0;
    side.touched.push(node);
    side.queue.push(node, 0);
  }

  let best = Infinity;
  let meet = -1;
  while (fwd.queue.length && bwd.queue.length) {
    const tf = fwd.queue.peekValue() as number;
    const tb = bwd.queue.peekValue() as number;
    if (tf + tb >= best) break;
    const [side, other] = tf <= tb ? [fwd, bwd] : [bwd, fwd];
    const c = side.queue.peekValue() as number;
    const node = side.queue.pop() as number;
    if (c > (side.cost[node] as number)) continue;
    searchCounts.settled++;
    const end = adjStart[node + 1] as number;
    for (let j = adjStart[node] as number; j < end; j++) {
      const id = adjEdge[j] as number;
      const next = adjTo[j] as number;
      const nc = c + weight(id);
      if (nc < (side.cost[next] as number)) {
        if (side.cost[next] === Infinity) side.touched.push(next);
        side.cost[next] = nc;
        side.prevEdge[next] = id;
        side.queue.push(next, nc);
      }
      const through = nc + (other.cost[next] as number);
      if (through < best) {
        best = through;
        meet = next;
      }
    }
  }
  if (meet < 0) return null;

  // from → meet, then meet → to.
  const steps: PathStep[] = [];
  for (let node = meet; node !== from;) {
    const id = fwd.prevEdge[node] as number;
    const prev = graph.other(id, node);
    steps.push({ edge: id, forward: graph.edge(id).from === prev });
    node = prev;
  }
  steps.reverse();
  for (let node = meet; node !== to;) {
    const id = bwd.prevEdge[node] as number;
    steps.push({ edge: id, forward: graph.edge(id).from === node });
    node = graph.other(id, node);
  }
  return steps;
}
