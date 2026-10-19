import {
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

async function reroute(
  stage: Stage,
  start: Place,
  end: Stop,
  route: RouteFn,
): Promise<Stage> {
  const legs = await route([
    start.coord,
    ...stage.via.map((v) => v.coord),
    end.coord,
  ]);
  return { ...stage, start, end, legs, stats: statsFromLegs(legs) };
}

/**
 * Moves the end of a stage to another place. The stop gets locked, the old
 * stop becomes an alternative, and this and the next stage are routed again.
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
  const [moved, after, hotel] = await Promise.all([
    reroute(stage, stage.start, end, route),
    next && reroute(next, asPlace(place), next.end, route),
    next ? nearestHotel(place.coord) : undefined,
  ]);
  const stages = [...trip.stages];
  stages[index] = { ...moved, hotel };
  if (after) stages[index + 1] = after;
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
