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
 * The route a path follows for most of its length on the graph, if any. It
 * needs at least minShare of the path. Longest ride first.
 */
export function followedRoute(
  graph: Graph,
  steps: PathStep[],
  routeKm: Map<string, number>,
  minShare: number,
): string | undefined {
  const ridden = new Map<string, number>();
  let total = 0;
  for (const s of steps) {
    const e = graph.edge(s.edge);
    total += e.lengthKm;
    for (const name of e.routes) {
      ridden.set(name, (ridden.get(name) ?? 0) + e.lengthKm);
    }
  }
  let found: string | undefined;
  let most = minShare * total;
  for (const [name, km] of ridden) {
    if (km >= most && km > 0.5 * (routeKm.get(name) ?? Infinity)) {
      found = name;
      most = km;
    }
  }
  return found;
}

/** Km per signed route on the graph. */
export function routeLengths(graph: Graph): Map<string, number> {
  const km = new Map<string, number>();
  for (const e of graph.edges) {
    for (const name of e.routes) {
      km.set(name, (km.get(name) ?? 0) + e.lengthKm);
    }
  }
  return km;
}

/**
 * Candidates that ride a route between two of its vias, with their estimated
 * km. Costs should make the route cheap. Longest ride on the route first. The
 * vias are an even spread of the route's vias by distance from the start, up
 * to maxVias.
 */
export function routeCandidates(
  graph: Graph,
  costs: Costs,
  start: number,
  end: number,
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
  const fromEnd = end === start ? fromStart : costs.from(graph, end);
  const all = vias
    .filter((n) => onRoute.has(n) && n !== start && n !== end)
    .sort((a, b) => (fromStart.km[a] ?? 0) - (fromStart.km[b] ?? 0));
  const every = Math.max(1, all.length / maxVias);
  const some = Array.from(
    { length: Math.min(all.length, maxVias) },
    (_, i) => all[Math.floor(i * every)] as number,
  );

  const out: (Candidate & { km: number })[] = [];
  for (const a of some) {
    const fromA = costs.from(graph, a);
    for (const b of some) {
      if (a === b) continue;
      const ride = fromA.km[b] ?? Infinity;
      const km =
        (fromStart.km[a] ?? Infinity) + ride + (fromEnd.km[b] ?? Infinity);
      if (km === Infinity) continue;
      out.push({ quality: -ride, nodes: [start, a, b, end], km });
    }
  }
  return out.sort((x, y) => x.quality - y.quality);
}
