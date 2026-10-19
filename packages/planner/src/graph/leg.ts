import {
  distanceKm,
  encodeLine,
  type Leg,
  type LonLat,
  type Surface,
} from "@wayline/domain";
import type { Graph, PathStep } from "./Graph";

export type LegMeta = { provider: string; profileHash: string };

/**
 * Leg along a path. from and to are joined to the path ends with
 * straight lines, which count as paved.
 */
export function pathToLeg(
  graph: Graph,
  steps: PathStep[],
  from: LonLat,
  to: LonLat,
  meta: LegMeta,
): Leg {
  const coords: LonLat[] = [];
  const elevation: number[] = [];
  let km = 0;
  let ascent = 0;
  let descent = 0;
  const surfaceKm: Surface = { paved: 0, gravel: 0, unpaved: 0 };

  for (const { edge, forward } of steps) {
    const e = graph.edges[edge]!;
    const line = graph.edgeLine(edge, forward);
    // Consecutive edges share their end point.
    const skip = coords.length ? 1 : 0;
    coords.push(...line.coords.slice(skip));
    elevation.push(...line.elevation.slice(skip));
    km += e.lengthKm;
    ascent += forward ? e.ascent : e.descent;
    descent += forward ? e.descent : e.ascent;
    surfaceKm.paved += e.surface.paved * e.lengthKm;
    surfaceKm.gravel += e.surface.gravel * e.lengthKm;
    surfaceKm.unpaved += e.surface.unpaved * e.lengthKm;
  }

  const first = coords[0];
  const last = coords.at(-1);
  if (!first || !last) return straightLeg(from, to, meta);
  const access = distanceKm(from, first) + distanceKm(last, to);
  if (distanceKm(from, first) > 0.001) {
    coords.unshift(from);
    elevation.unshift(elevation[0]!);
  }
  if (distanceKm(last, to) > 0.001) {
    coords.push(to);
    elevation.push(elevation.at(-1)!);
  }
  km += access;
  surfaceKm.paved += access;

  return {
    from,
    to,
    geometry: encodeLine(coords),
    elevation,
    distance: Math.round(km * 1000),
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    surface: shares(surfaceKm, km),
    ...meta,
  };
}

/** Straight line, for points the network does not connect. */
export function straightLeg(
  from: LonLat,
  to: LonLat,
  meta: LegMeta,
  elevation: [number, number] = [0, 0],
): Leg {
  const [a, b] = elevation;
  return {
    from,
    to,
    geometry: encodeLine([from, to]),
    elevation: [a, b],
    distance: Math.round(distanceKm(from, to) * 1000),
    ascent: Math.max(0, b - a),
    descent: Math.max(0, a - b),
    surface: { paved: 1, gravel: 0, unpaved: 0 },
    ...meta,
  };
}

function shares(km: Surface, total: number): Surface {
  if (!total) return { paved: 1, gravel: 0, unpaved: 0 };
  return {
    paved: km.paved / total,
    gravel: km.gravel / total,
    unpaved: km.unpaved / total,
  };
}
