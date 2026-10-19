import { decode, encode } from "@googlemaps/polyline-codec";
import turfBearing from "@turf/bearing";
import turfDistance from "@turf/distance";
import type { Leg, LonLat } from "./schema";

/** Point on a route: position, elevation in m, km from the start. */
export type RoutePoint = { coord: LonLat; ele: number; km: number };

/** Great-circle distance in km. */
export function distanceKm(a: LonLat, b: LonLat): number {
  return turfDistance(a, b, { units: "kilometers" });
}

/** Direction of travel from a to b. 0 = north, 90 = east. */
export function bearing(a: LonLat, b: LonLat): number {
  return (turfBearing(a, b) + 360) % 360;
}

/** Polyline (Google format, 5 decimals) to [lon, lat] points. */
export function decodeLine(geometry: string): LonLat[] {
  return decode(geometry, 5).map(([lat, lon]) => [lon, lat] as LonLat);
}

export function encodeLine(coords: LonLat[]): string {
  return encode(
    coords.map(([lon, lat]) => [lat, lon]),
    5,
  );
}

/** All points of the legs, with km from the first point. */
export function routePoints(legs: Leg[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  let km = 0;
  for (const leg of legs) {
    const coords = decodeLine(leg.geometry);
    coords.forEach((coord, i) => {
      const prev = out.at(-1);
      // The first point of a leg repeats the last point of the one before.
      if (i === 0 && prev && distanceKm(prev.coord, coord) < 0.001) return;
      if (prev) km += distanceKm(prev.coord, coord);
      out.push({ coord, ele: leg.elevation[i] ?? prev?.ele ?? 0, km });
    });
  }
  return out;
}

/** Position on the route at the given km. Clamped to the ends. */
export function pointAtKm(points: RoutePoint[], km: number): RoutePoint {
  const first = points[0];
  if (!first) throw new Error("Empty route");
  if (km <= first.km) return first;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.km >= km) {
      const f = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
      return {
        coord: [
          a.coord[0] + (b.coord[0] - a.coord[0]) * f,
          a.coord[1] + (b.coord[1] - a.coord[1]) * f,
        ],
        ele: a.ele + (b.ele - a.ele) * f,
        km,
      };
    }
  }
  return points.at(-1)!;
}
