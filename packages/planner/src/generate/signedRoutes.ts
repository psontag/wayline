import type { LonLat } from "@wayline/domain";
import type { Graph, PathStep } from "../graph/Graph";
import type { Candidate, Costs } from "./search";

export type SignedRoute = { name: string; edges: Set<number> };

/** Signed routes, with only their edges within reach. */
export function routesInReach(
  graph: Graph,
  inReach: (node: number) => boolean,
): SignedRoute[] {
  const routes = new Map<string, SignedRoute>();
  for (const e of graph.edges) {
    if (!inReach(e.from) || !inReach(e.to)) continue;
    for (const name of e.routes) {
      let route = routes.get(name);
      if (!route) {
        route = { name, edges: new Set() };
        routes.set(name, route);
      }
      route.edges.add(e.id);
    }
  }
  return [...routes.values()];
}

/** Km of a route within reach, and its middle. */
export function routeExtent(
  graph: Graph,
  route: SignedRoute,
): { km: number; middle: LonLat } {
  let km = 0;
  let lon = 0;
  let lat = 0;
  for (const id of route.edges) {
    const e = graph.edge(id);
    const [x, y] = graph.coord(e.from);
    km += e.lengthKm;
    lon += x * e.lengthKm;
    lat += y * e.lengthKm;
  }
  return { km, middle: km ? [lon / km, lat / km] : [0, 0] };
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
 * Candidates that ride a route between two of its vias. Costs should make the
 * route cheap. Longest ride on the route first. The vias are an even spread
 * of the route's vias by distance from the start, up to maxVias.
 */
export function routeCandidates(
  graph: Graph,
  costs: Costs,
  start: number,
  end: number,
  route: SignedRoute,
  vias: number[],
  totalKm: number,
  maxVias: number,
): Candidate[] {
  const onRoute = new Set<number>();
  for (const id of route.edges) {
    const e = graph.edge(id);
    onRoute.add(e.from);
    onRoute.add(e.to);
  }
  const fromStart = costs.from(graph, start);
  const fromEnd = end === start ? fromStart : costs.from(graph, end);
  const all = vias
    .filter((n) => onRoute.has(n) && n !== start && n !== end)
    .sort((a, b) => (fromStart.km[a] ?? 0) - (fromStart.km[b] ?? 0));
  const every = Math.max(1, all.length / maxVias);
  const some = Array.from(
    { length: Math.min(all.length, maxVias) },
    (_, i) => all[Math.floor(i * every)] as number,
  );

  const out: Candidate[] = [];
  for (const a of some) {
    const fromA = costs.from(graph, a);
    for (const b of some) {
      if (a === b) continue;
      const ride = fromA.km[b] ?? Infinity;
      const est =
        (fromStart.km[a] ?? Infinity) + ride + (fromEnd.km[b] ?? Infinity);
      if (!(Math.abs(est - totalKm) < 0.1 * totalKm)) continue;
      out.push({ quality: -ride, nodes: [start, a, b, end] });
    }
  }
  return out.sort((x, y) => x.quality - y.quality);
}
