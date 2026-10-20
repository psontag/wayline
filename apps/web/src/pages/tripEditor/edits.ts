import {
  decodeLine,
  distanceKm,
  type Hotel,
  type Leg,
  type LonLat,
  type Place,
  type Stage,
  routePoints,
  statsFromLegs,
  type Stop,
  type Trip,
} from "@wayline/domain";

/** Routes through the points. One leg per consecutive pair. */
export type RouteFn = (points: LonLat[]) => Promise<Leg[]>;
/** Nearest hotel at a place, if any. */
export type HotelFn = (coord: LonLat) => Promise<Hotel | undefined>;

export function setStage(trip: Trip, index: number, stage: Stage): Trip {
  return {
    ...trip,
    stages: trip.stages.map((s, i) => (i === index ? stage : s)),
  };
}

export function setLocked(trip: Trip, index: number, locked: boolean): Trip {
  const stage = trip.stages[index];
  if (!stage) return trip;
  return setStage(trip, index, { ...stage, end: { ...stage.end, locked } });
}

export function setHotel(trip: Trip, index: number, hotel: Hotel): Trip {
  const stage = trip.stages[index];
  if (!stage) return trip;
  return setStage(trip, index, { ...stage, hotel });
}

function asPlace({ name, kind, coord, osmId }: Place): Place {
  return osmId ? { name, kind, coord, osmId } : { name, kind, coord };
}

function samePlace(a: Place, b: Place) {
  return a.name === b.name && distanceKm(a.coord, b.coord) < 0.05;
}

/** Points between the legs: the start, the joins and the end. */
export function legPoints(stage: Stage): LonLat[] {
  return [
    stage.start.coord,
    ...stage.legs.slice(0, -1).map((leg) => leg.to),
    stage.end.coord,
  ];
}

/** Km from a point to the segment a–b. Flat math is precise enough here. */
function segmentKm(at: LonLat, a: LonLat, b: LonLat): number {
  const k = Math.cos((at[1] * Math.PI) / 180);
  const [px, py] = [(at[0] - a[0]) * k, at[1] - a[1]];
  const [dx, dy] = [(b[0] - a[0]) * k, b[1] - a[1]];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
  return Math.hypot(px - t * dx, py - t * dy) * 111.2;
}

/** Index of the leg that passes closest to the point. */
export function nearestLeg(legs: Leg[], at: LonLat): number {
  let best = { index: 0, km: Infinity };
  for (const [index, leg] of legs.entries()) {
    const line = decodeLine(leg.geometry);
    for (const [i, b] of line.entries()) {
      const km = segmentKm(at, line[i - 1] ?? b, b);
      if (km < best.km) best = { index, km };
    }
  }
  return best.index;
}

/** Via points that are still among the points. */
function keepVia(via: Place[], points: LonLat[]): Place[] {
  return via.filter((v) => points.some((p) => distanceKm(p, v.coord) < 0.001));
}

export function withLegs(stage: Stage, legs: Leg[]): Stage {
  return { ...stage, legs, stats: statsFromLegs(legs) };
}

/**
 * Moves the end of a stage to another place. The stop gets locked and the
 * old stop becomes an alternative. The route of this and the next stage is
 * kept: only the leg that passes the new place is routed again, split at it.
 */
export async function moveStop(
  trip: Trip,
  index: number,
  place: Place,
  { route, nearestHotel }: { route: RouteFn; nearestHotel: HotelFn },
): Promise<Trip> {
  const stage = trip.stages[index];
  if (!stage) return trip;
  const next = trip.stages[index + 1];
  const end: Stop = {
    ...asPlace(place),
    locked: true,
    alternatives: [
      asPlace(stage.end),
      ...stage.end.alternatives.filter((a) => !samePlace(a, place)),
    ],
  };
  const legs = [...stage.legs, ...(next?.legs ?? [])];
  const points = [
    ...legPoints(stage),
    ...(next ? legPoints(next).slice(1) : []),
  ];
  const k = nearestLeg(legs, place.coord);
  const from = points[k] ?? stage.start.coord;
  const to = points[k + 1];
  const [split, hotel] = await Promise.all([
    route(to ? [from, place.coord, to] : [from, place.coord]),
    next ? nearestHotel(place.coord) : undefined,
  ]);
  const [before, after] = split;
  const own = [...legs.slice(0, k), ...(before ? [before] : [])];
  const rest = [...(after ? [after] : []), ...legs.slice(k + 1)];
  const stages = [...trip.stages];
  const moved = withLegs(
    {
      ...stage,
      end,
      via: keepVia(
        [...stage.via, ...(next?.via ?? [])],
        points.slice(1, k + 1),
      ),
    },
    own,
  );
  // The old hotel is in the old town.
  delete moved.hotel;
  if (hotel) moved.hotel = hotel;
  stages[index] = moved;
  if (next) {
    stages[index + 1] = withLegs(
      {
        ...next,
        start: asPlace(place),
        via: keepVia([...stage.via, ...next.via], points.slice(k + 1, -1)),
      },
      rest,
    );
  }
  return { ...trip, stages };
}

/**
 * Rough stage length if it ended at the place: the km of the nearest route
 * point of this or the next stage, plus the way off the route.
 */
export function distanceIfEndingAt(
  stage: Stage,
  next: Stage | undefined,
  place: LonLat,
): number {
  const own = routePoints(stage.legs);
  const length = own.at(-1)?.km ?? 0;
  const candidates = [
    ...own,
    ...(next
      ? routePoints(next.legs).map((p) => ({ ...p, km: p.km + length }))
      : []),
  ];
  let best = { km: length, off: Infinity };
  // Every few points is precise enough for a label.
  for (let i = 0; i < candidates.length; i += 3) {
    const p = candidates[i];
    if (!p) continue;
    const off = distanceKm(p.coord, place);
    if (off < best.off) best = { km: p.km, off };
  }
  return Math.round((best.km + best.off) * 1000);
}
