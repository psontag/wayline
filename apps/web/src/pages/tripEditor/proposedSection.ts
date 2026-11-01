import { type Leg, type LonLat, routePoints } from "@wayline/domain";

/** The part of a proposed route that differs from the route as ridden. */
export type ProposedSection = {
  /** km on the ridden route where the routes split and meet again. */
  startKm: number;
  endKm: number;
  /** Proposed heights, with km moved onto `startKm`..`endKm`. */
  points: { km: number; ele: number }[];
  /** Proposed line from the split to where the routes meet again. */
  coords: LonLat[];
};

const key = ([lon, lat]: LonLat) => `${lon.toFixed(5)},${lat.toFixed(5)}`;

/**
 * Finds where `proposed` leaves `legs` and where it comes back. The proposed
 * km in between are stretched onto the ridden km, so both profiles line up
 * before and after the change.
 */
export function proposedSection(
  legs: Leg[],
  proposed: Leg[],
): ProposedSection | undefined {
  const own = routePoints(legs);
  const other = routePoints(proposed);
  const same = (i: number, j: number) => {
    const a = own[i];
    const b = other[j];
    return !!a && !!b && key(a.coord) === key(b.coord);
  };

  let head = 0;
  while (same(head, head)) head++;
  if (head === own.length && head === other.length) return undefined;
  let tail = 0;
  const max = Math.min(own.length, other.length) - Math.max(head - 1, 0);
  while (tail < max - 1 && same(own.length - 1 - tail, other.length - 1 - tail))
    tail++;

  // Include the shared point on each side, so the section joins the route.
  const from = Math.max(head - 1, 0);
  const ownTo = Math.min(own.length - tail, own.length - 1);
  const otherTo = Math.min(other.length - tail, other.length - 1);
  const ownFrom = own[from];
  const ownEnd = own[ownTo];
  const otherFrom = other[from];
  const otherEnd = other[otherTo];
  if (!ownFrom || !ownEnd || !otherFrom || !otherEnd) return undefined;

  const span = otherEnd.km - otherFrom.km;
  const scale = span > 0 ? (ownEnd.km - ownFrom.km) / span : 0;
  const part = other.slice(from, otherTo + 1);
  // The proposed route only stops earlier: nothing to compare.
  if (part.length < 2) return undefined;
  return {
    startKm: ownFrom.km,
    endKm: ownEnd.km,
    points: part.map((p) => ({
      km: ownFrom.km + (p.km - otherFrom.km) * scale,
      ele: p.ele,
    })),
    coords: part.map((p) => p.coord),
  };
}
