import {
  type GenerateRequest,
  type LonLat,
  statsFromLegs,
  type Trip,
} from "@wayline/domain";
import type { AbortSignalLike, RoutingProvider } from "@wayline/providers";
import type { Graph, PathStep } from "../graph/Graph";

/** Gap between router waypoints on graph nodes. */
const WAYPOINT_KM = 10;

/**
 * Router waypoints of each stage: the stage ends and graph nodes about
 * every WAYPOINT_KM in between, so the router follows the graph path.
 * Node ids repeat between proposals, so routed legs can be cached.
 */
export function stageWaypoints(
  graph: Graph,
  trip: Trip,
  stageSteps: PathStep[][],
): LonLat[][] {
  return trip.stages.map((stage, i) => {
    const steps = stageSteps[i] ?? [];
    const total = steps.reduce((km, s) => km + graph.edge(s.edge).lengthKm, 0);
    const points: LonLat[] = [stage.start.coord];
    let km = 0;
    let sinceLast = 0;
    for (const { edge, forward } of steps) {
      const e = graph.edge(edge);
      km += e.lengthKm;
      sinceLast += e.lengthKm;
      if (sinceLast >= WAYPOINT_KM && total - km >= WAYPOINT_KM / 2) {
        points.push(graph.coord(forward ? e.to : e.from));
        sinceLast = 0;
      }
    }
    points.push(stage.end.coord);
    return points;
  });
}

/**
 * Step 7: routes all stages of a trip with the router. One call for the
 * whole trip, so the router's limit on parallel requests holds.
 */
export async function routeTrip(
  trip: Trip,
  waypoints: LonLat[][],
  routing: RoutingProvider,
  request: GenerateRequest,
  signal?: AbortSignalLike,
): Promise<Trip> {
  // Stage ends are shared, so the stage lists join into one.
  const points = waypoints.flatMap((w, i) => (i === 0 ? w : w.slice(1)));
  const legs = await routing.route(points, {
    profile: request.profile,
    ...(signal ? { signal } : {}),
  });
  let next = 0;
  return {
    ...trip,
    stages: trip.stages.map((stage, i) => {
      const count = (waypoints[i]?.length ?? 1) - 1;
      const own = legs.slice(next, (next += count));
      return { ...stage, legs: own, stats: statsFromLegs(own) };
    }),
  };
}
