import {
  decodeLine,
  type Leg,
  type RouteNetwork,
  routePoints,
  type Surface,
} from "@wayline/domain";
import type { ProfilePoint, SurfaceKind } from "@wayline/ui";

type SurfaceIndex = Map<string, SurfaceKind>;

const indexes = new WeakMap<RouteNetwork, SurfaceIndex>();

const key = ([lon, lat]: [number, number]) =>
  `${lon.toFixed(5)},${lat.toFixed(5)}`;

function dominant(surface: Surface): SurfaceKind {
  if (surface.paved >= surface.gravel && surface.paved >= surface.unpaved) {
    return "paved";
  }
  return surface.gravel >= surface.unpaved ? "gravel" : "unpaved";
}

// Legs only store surface shares. Route points come from network edges, so
// each point can look up the main surface of its edge.
function surfaceIndex(network: RouteNetwork): SurfaceIndex {
  let index = indexes.get(network);
  if (!index) {
    index = new Map();
    for (const edge of network.edges) {
      const kind = dominant(edge.surface);
      for (const coord of decodeLine(edge.geometry))
        index.set(key(coord), kind);
    }
    indexes.set(network, index);
  }
  return index;
}

/** Elevation profile points with the surface after each point. */
export function profilePoints(
  legs: Leg[],
  network: RouteNetwork | undefined,
): ProfilePoint[] {
  const index = network && surfaceIndex(network);
  const fallback = dominant(
    legs[0]?.surface ?? { paved: 1, gravel: 0, unpaved: 0 },
  );
  return routePoints(legs).map((p) => ({
    km: p.km,
    ele: p.ele,
    surface: index?.get(key(p.coord)) ?? fallback,
  }));
}
