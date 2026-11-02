import type { Graph, PathStep } from "../graph/Graph";
import type { RouteCatalog } from "./routeCatalog";
import type { Candidate, Costs } from "./search";

export type SignedRoute = {
  name: string;
  /** Lower is more important. */
  rank: number;
  edges: Set<number>;
};

/** A route without a known end stops at a station this close to its last via. */
const END_STATION_KM = 5;
/** A route without a known end starts at one of this many vias nearest the start. */
const NO_END_FIRST_VIAS = 2;

/** Signed routes, with only their edges within reach. */
export function routesInReach(
  graph: Graph,
  catalog: RouteCatalog,
  inReach: (node: number) => boolean,
): SignedRoute[] {
  const routes = new Map<string, SignedRoute>();
  for (const e of graph.edges) {
    if (!inReach(e.from) || !inReach(e.to)) continue;
    for (const name of catalog.on(e)) {
      let route = routes.get(name);
      if (!route) {
        route = { name, rank: catalog.rank(name), edges: new Set() };
        routes.set(name, route);
      }
      route.edges.add(e.id);
    }
  }
  return [...routes.values()];
}

/** Km of a route on edges not in used. */
export function kmUnused(
  graph: Graph,
  route: SignedRoute,
  used: Set<number>,
): number {
  let km = 0;
  for (const id of route.edges) {
    if (!used.has(id)) km += graph.edge(id).lengthKm;
  }
  return km;
}

export function kmOnRoute(
  graph: Graph,
  steps: PathStep[],
  route: SignedRoute,
): number {
  let km = 0;
  for (const s of steps) {
    if (route.edges.has(s.edge)) km += graph.edge(s.edge).lengthKm;
  }
  return km;
}

/**
 * The route with the most km on a path, if at least minShare of the path
 * rides it. The more important route wins a tie.
 */
export function followedRoute(
  graph: Graph,
  steps: PathStep[],
  catalog: RouteCatalog,
  minShare: number,
): string | undefined {
  const ridden = new Map<string, number>();
  let total = 0;
  for (const s of steps) {
    const e = graph.edge(s.edge);
    total += e.lengthKm;
    for (const name of catalog.on(e)) {
      ridden.set(name, (ridden.get(name) ?? 0) + e.lengthKm);
    }
  }
  let found: string | undefined;
  let most = minShare * total;
  for (const [name, km] of ridden) {
    const tie = found && km === most && catalog.rank(name) < catalog.rank(found);
    if (km > most || tie || (!found && km === most)) {
      found = name;
      most = km;
    }
  }
  return found;
}

/**
 * Candidates that ride a route between two of its vias, with their estimated
 * km. Costs should make the route cheap. Longest ride first. The vias are an
 * even spread of the route's vias by distance from the start, up to maxVias.
 * Without an end, each ride goes on to the station nearest its last via.
 */
export function routeCandidates(
  graph: Graph,
  costs: Costs,
  start: number,
  end: number | undefined,
  route: SignedRoute,
  vias: number[],
  maxVias: number,
): (Candidate & { km: number })[] {
  const onRoute = new Set<number>();
  for (const id of route.edges) {
    const e = graph.edge(id);
    onRoute.add(e.from);
    onRoute.add(e.to);
  }
  const fromStart = costs.from(graph, start);
  const all = vias
    .filter((n) => onRoute.has(n) && n !== start && n !== end)
    .sort((a, b) => (fromStart.km[a] ?? 0) - (fromStart.km[b] ?? 0));
  const every = Math.max(1, all.length / maxVias);
  const some = Array.from(
    { length: Math.min(all.length, maxVias) },
    (_, i) => all[Math.floor(i * every)] as number,
  );
  const from = new Map(some.map((v) => [v, costs.from(graph, v)]));
  const stops = new Map(
    some.map((v) => [
      v,
      end ??
        graph.nearestNode(graph.coord(v), {
          maxKm: END_STATION_KM,
          filter: (n) => n.kind === "station" && n.id !== start,
        }),
    ]),
  );

  // Without an end, a far first via makes the trip ride out and back past the
  // start. So the ride starts near the start.
  const firsts = end === undefined ? some.slice(0, NO_END_FIRST_VIAS) : some;
  const out: (Candidate & { km: number })[] = [];
  for (const a of firsts) {
    for (const b of some) {
      const stop = stops.get(b);
      if (a === b || stop === undefined) continue;
      const ride = from.get(a)?.km[b] ?? Infinity;
      const km =
        (fromStart.km[a] ?? Infinity) +
        ride +
        (from.get(b)?.km[stop] ?? Infinity);
      if (km === Infinity) continue;
      const nodes = stop === b ? [start, a, b] : [start, a, b, stop];
      out.push({ quality: -ride, nodes, km });
    }
  }
  return out.sort((x, y) => x.quality - y.quality);
}
