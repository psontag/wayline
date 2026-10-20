import type { BBox, Leg, LonLat } from "@wayline/domain";
import type { RouteOptions, RoutingProvider } from "@wayline/providers";
import { bboxAround } from "./graph/area";
import { shortestPath } from "./graph/dijkstra";
import type { Graph } from "./graph/Graph";
import { pathToLeg, straightLeg } from "./graph/leg";

/** Max distance from a point to the network. Further away is a straight line. */
const SNAP_KM = 5;

/**
 * Router on the route network: snaps to the nearest node and takes the
 * nicest path. Stands in for BRouter. graph gives the network around a bbox.
 */
export class FakeRouting implements RoutingProvider {
  constructor(private graph: (bbox: BBox) => Promise<Graph>) {}

  async route(points: LonLat[], options: RouteOptions): Promise<Leg[]> {
    // Paths may bend away from the points, so load some margin.
    const graph = await this.graph(bboxAround(points, 30));
    const meta = { provider: "fake", profileHash: options.profile };
    const legs: Leg[] = [];
    for (const [i, to] of points.entries()) {
      const from = points[i - 1];
      if (!from) continue;
      if (options.signal?.aborted) throw new Error("Aborted");
      const a = graph.nearestNode(from, { maxKm: SNAP_KM });
      const b = graph.nearestNode(to, { maxKm: SNAP_KM });
      const steps =
        a !== undefined && b !== undefined && a !== b
          ? shortestPath(graph, a, b)
          : null;
      legs.push(
        steps
          ? pathToLeg(graph, steps, from, to, meta)
          : straightLeg(from, to, meta, [
              elevationNear(graph, a),
              elevationNear(graph, b),
            ]),
      );
    }
    return legs;
  }
}

function elevationNear(graph: Graph, node: number | undefined): number {
  if (node === undefined) return 0;
  const edge = graph.edgesAt(node)[0];
  if (edge === undefined) return 0;
  const line = graph.edgeLine(edge, graph.edge(edge).from === node);
  return line.elevation[0] ?? 0;
}
