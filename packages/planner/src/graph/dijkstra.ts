import type { NetworkEdge } from "@wayline/domain";
import FlatQueue from "flatqueue";
import type { Graph, PathStep } from "./Graph";

/** Cost of using an edge. Infinity blocks it. */
export type EdgeCost = (edge: NetworkEdge) => number;

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
 * Cheapest paths from one node. Stops early at target or when the cost
 * passes maxCost.
 */
export function dijkstra(
  graph: Graph,
  source: number,
  {
    target,
    cost = defaultCost,
    maxCost = Infinity,
  }: { target?: number; cost?: EdgeCost; maxCost?: number } = {},
): DijkstraResult {
  const n = graph.nodes.length;
  const best = new Float64Array(n).fill(Infinity);
  const km = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const queue = new FlatQueue<number>();
  best[source] = 0;
  km[source] = 0;
  queue.push(source, 0);

  while (queue.length) {
    const c = queue.peekValue()!;
    const node = queue.pop()!;
    if (c > best[node]!) continue;
    if (node === target || c > maxCost) break;
    for (const id of graph.adjacency[node]!) {
      const edge = graph.edges[id]!;
      const next = graph.other(id, node);
      const nc = c + cost(edge);
      if (nc < best[next]!) {
        best[next] = nc;
        km[next] = km[node]! + edge.lengthKm;
        prevEdge[next] = id;
        queue.push(next, nc);
      }
    }
  }
  return { cost: best, km, prevEdge };
}

/** Steps from the source of a Dijkstra run to target, or null. */
export function pathTo(
  graph: Graph,
  result: DijkstraResult,
  target: number,
): PathStep[] | null {
  if (result.cost[target] === Infinity) return null;
  const steps: PathStep[] = [];
  let node = target;
  while (result.prevEdge[node]! >= 0) {
    const id = result.prevEdge[node]!;
    const prev = graph.other(id, node);
    steps.push({ edge: id, forward: graph.edges[id]!.from === prev });
    node = prev;
  }
  return steps.reverse();
}

/** Cheapest path between two nodes, or null if they are not connected. */
export function shortestPath(
  graph: Graph,
  from: number,
  to: number,
  cost: EdgeCost = defaultCost,
): PathStep[] | null {
  return pathTo(graph, dijkstra(graph, from, { target: to, cost }), to);
}
