import {
  type Connection,
  decodeLine,
  distanceKm,
  type Hotel,
  type Leg,
  type LonLat,
  type Place,
  type RoutePoint,
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

export function sameTrain(a: Connection, b: Connection): boolean {
  return (
    a.direction === b.direction &&
    a.departure === b.departure &&
    a.lines.join() === b.lines.join()
  );
}

/** Saves the train, or removes it if it is saved. */
export function toggleTrain(trip: Trip, train: Connection): Trip {
  const saved = trip.trains.some((t) => sameTrain(t, train));
  return {
    ...trip,
    trains: saved
      ? trip.trains.filter((t) => !sameTrain(t, train))
      : [...trip.trains, train].sort((a, b) =>
          a.departure.localeCompare(b.departure),
        ),
  };
}

/** Saves the hotel, or removes it if it is saved. */
export function toggleSavedHotel(trip: Trip, hotel: Hotel): Trip {
  const saved = trip.savedHotels.some((h) => h.osmId === hotel.osmId);
  return {
    ...trip,
    savedHotels: saved
      ? trip.savedHotels.filter((h) => h.osmId !== hotel.osmId)
      : [...trip.savedHotels, hotel],
  };
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

/** A stage if it ended at another place. Meters. */
export type StageIfEnding = {
  distance: number;
  ascent: number;
  /** Length of the next stage. Missing on the last stage. */
  nextDistance?: number;
};

/** The stage if it ended at the place, routed the same way as moveStop. */
export async function routedStageIfEnding(
  trip: Trip,
  index: number,
  place: Place,
  route: RouteFn,
): Promise<StageIfEnding> {
  const moved = await moveStop(trip, index, place, {
    route,
    nearestHotel: async () => undefined,
  });
  const stage = moved.stages[index];
  const next = moved.stages[index + 1];
  const out: StageIfEnding = {
    distance: stage?.stats.distance ?? 0,
    ascent: stage?.stats.ascent ?? 0,
  };
  if (next) out.nextDistance = next.stats.distance;
  return out;
}

/**
 * Rough stage if it ended at the place: km and ascent at the nearest route
 * point of this or the next stage, plus the way off the route. The way off
 * the route also counts for the next stage.
 */
export function stageIfEndingAt(
  stage: Stage,
  next: Stage | undefined,
  place: LonLat,
): StageIfEnding {
  const own = routePoints(stage.legs);
  const after = next ? routePoints(next.legs) : [];
  const length = own.at(-1)?.km ?? 0;
  const ownAscent = ascentAlong(own, stage.stats.ascent);
  const afterAscent = ascentAlong(after, next?.stats.ascent ?? 0);
  const candidates = [
    ...own.map((p, i) => ({ ...p, ascent: ownAscent[i] ?? 0 })),
    ...after.map((p, i) => ({
      ...p,
      km: p.km + length,
      ascent: stage.stats.ascent + (afterAscent[i] ?? 0),
    })),
  ];
  const total = length + (after.at(-1)?.km ?? 0);
  let best = { km: length, ascent: stage.stats.ascent, off: Infinity };
  // Every few points is precise enough for a label.
  for (let i = 0; i < candidates.length; i += 3) {
    const p = candidates[i];
    if (!p) continue;
    const off = distanceKm(p.coord, place);
    if (off < best.off) best = { km: p.km, ascent: p.ascent, off };
  }
  const off = best.off === Infinity ? 0 : best.off;
  const out: StageIfEnding = {
    distance: Math.round((best.km + off) * 1000),
    ascent: Math.round(best.ascent),
  };
  if (next) out.nextDistance = Math.round((total - best.km + off) * 1000);
  return out;
}

/** Climbs smaller than this count as noise. Meters. */
const ASCENT_NOISE = 5;

/**
 * Ascent from the start at each point. Small ups and downs are left out,
 * then the sum is scaled to the stage ascent, so the end matches it.
 */
export function ascentAlong(points: RoutePoint[], total: number): number[] {
  const out: number[] = [];
  let sum = 0;
  let low = points[0]?.ele ?? 0;
  for (const { ele } of points) {
    if (ele < low) low = ele;
    else if (ele - low >= ASCENT_NOISE) {
      sum += ele - low;
      low = ele;
    }
    out.push(sum);
  }
  const length = points.at(-1)?.km ?? 0;
  if (sum > 0) return out.map((a) => (a / sum) * total);
  // A flat profile: spread the ascent over the km.
  return points.map((p) => (length ? (p.km / length) * total : 0));
}
