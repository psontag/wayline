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
 * Steps of a stage cut about every WAYPOINT_KM. Each piece becomes one leg,
 * so an edit routes only the pieces it touches and keeps the rest.
 */
export function legSteps(graph: Graph, steps: PathStep[]): PathStep[][] {
  const total = steps.reduce((km, s) => km + graph.edge(s.edge).lengthKm, 0);
  const out: PathStep[][] = [[]];
  let km = 0;
  let sinceLast = 0;
  for (const step of steps) {
    const length = graph.edge(step.edge).lengthKm;
    km += length;
    sinceLast += length;
    out.at(-1)?.push(step);
    if (sinceLast >= WAYPOINT_KM && total - km >= WAYPOINT_KM / 2) {
      out.push([]);
      sinceLast = 0;
    }
  }
  return out;
}

/** Node at the end of the steps. */
export function endNode(graph: Graph, steps: PathStep[]): number | undefined {
  const last = steps.at(-1);
  if (!last) return undefined;
  const e = graph.edge(last.edge);
  return last.forward ? e.to : e.from;
}

/**
 * Router waypoints of each stage: the stage ends and the graph nodes
 * between its legs, so the router follows the graph path. Node ids repeat
 * between proposals, so routed legs can be cached.
 */
export function stageWaypoints(
  graph: Graph,
  trip: Trip,
  stageSteps: PathStep[][],
): LonLat[][] {
  return trip.stages.map((stage, i) => {
    const pieces = legSteps(graph, stageSteps[i] ?? []);
    const inner = pieces
      .slice(0, -1)
      .map((p) => endNode(graph, p))
      .filter((n): n is number => n !== undefined)
      .map((n) => graph.coord(n));
    return [stage.start.coord, ...inner, stage.end.coord];
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
