import {
  distanceKm,
  encodeLine,
  type Hotel,
  type HotelBudget,
  type Leg,
  type LonLat,
  type Place,
  type Profile,
  type Stage,
  statsFromLegs,
  type Surface,
  type Trip,
  TRIP_SCHEMA_VERSION,
} from "@wayline/domain";
import { filteredClimb } from "../graph/Graph";

/** Provider name on legs that come from an imported track. */
export const IMPORT_PROVIDER = "import";

/**
 * Point of a GPX track. ele is missing when the file has none. surface is
 * there when the point lies on the route network.
 */
export type TrackPoint = {
  coord: LonLat;
  ele?: number;
  surface?: Surface;
  /**
   * Ascent and descent since the point before, from the network edge both
   * lie on. Only when the elevation comes from the network.
   */
  climb?: [number, number];
};

/** Points closer than this to the simplified line are left out. */
const SIMPLIFY_KM = 0.005;
/** Legs are about this long, so an edit routes only a small piece. */
const PIECE_KM = 10;
/** A start and end this close make a loop. */
const LOOP_KM = 2;

/** Does any point carry elevation? */
export function hasElevation(points: TrackPoint[]): boolean {
  return points.some((p) => p.ele !== undefined);
}

/**
 * Drops points that add little to the shape (Douglas-Peucker), so a track
 * with a point every second stays small.
 */
export function simplifyTrack(
  points: TrackPoint[],
  toleranceKm = SIMPLIFY_KM,
): TrackPoint[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() ?? [0, 0];
    let worst = -1;
    let worstKm = toleranceKm;
    for (let i = a + 1; i < b; i++) {
      const d = offsetKm(points[i], points[a], points[b]);
      if (d > worstKm) {
        worst = i;
        worstKm = d;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([a, worst], [worst, b]);
  }
  return points.filter((_, i) => keep[i]);
}

/** Distance of p from the segment a–b, on a flat local projection. */
function offsetKm(
  p: TrackPoint | undefined,
  a: TrackPoint | undefined,
  b: TrackPoint | undefined,
): number {
  if (!p || !a || !b) return 0;
  const kx = 111.32 * Math.cos((a.coord[1] * Math.PI) / 180);
  const ky = 110.57;
  const px = (p.coord[0] - a.coord[0]) * kx;
  const py = (p.coord[1] - a.coord[1]) * ky;
  const bx = (b.coord[0] - a.coord[0]) * kx;
  const by = (b.coord[1] - a.coord[1]) * ky;
  const len = bx * bx + by * by;
  const t = len ? Math.max(0, Math.min(1, (px * bx + py * by) / len)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Legs of about PIECE_KM along the track. Neighbors share their end point.
 * Stats come from all points, the geometry is simplified. Km without
 * surface count as unknown: the shares add up to less than 1.
 */
export function trackLegs(points: TrackPoint[], profile: Profile): Leg[] {
  const elevation = fillElevation(points);
  const filled = points.map((p, i) => ({ ...p, ele: elevation[i] ?? 0 }));
  const legs: Leg[] = [];
  let from = 0;
  let km = 0;
  for (let i = 1; i < filled.length; i++) {
    const a = filled[i - 1];
    const b = filled[i];
    if (a && b) km += distanceKm(a.coord, b.coord);
    if (km >= PIECE_KM || i === filled.length - 1) {
      legs.push(leg(filled.slice(from, i + 1), km, profile));
      from = i;
      km = 0;
    }
  }
  return legs;
}

/** Km of the track away from the route network. */
export function offNetworkKm(points: TrackPoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b && !a.surface) km += distanceKm(a.coord, b.coord);
  }
  return km;
}

/**
 * Elevation per point. Gaps between known values are interpolated by
 * distance. Before the first and after the last known value, it stays
 * level. 0 without any.
 */
function fillElevation(points: TrackPoint[]): number[] {
  const out = points.map((p) => p.ele);
  let last: number | undefined;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === undefined) continue;
    if (last !== undefined && i - last > 1) {
      const a = out[last] ?? 0;
      const b = out[i] ?? 0;
      const km = [0];
      for (let k = last + 1; k <= i; k++) {
        const p = points[k - 1];
        const q = points[k];
        km.push((km.at(-1) ?? 0) + (p && q ? distanceKm(p.coord, q.coord) : 0));
      }
      const total = km.at(-1) || 1;
      for (let k = last + 1; k < i; k++) {
        out[k] = a + ((b - a) * (km[k - last] ?? 0)) / total;
      }
    }
    last = i;
  }
  const first = out.find((e) => e !== undefined) ?? 0;
  let prev = first;
  return out.map((e) => (prev = e ?? prev));
}

/**
 * Ascent and descent. Parts on a network edge add up the edge's own
 * climb, as generated trips do. The rest is filtered from the profile.
 */
function climb(points: (TrackPoint & { ele: number })[]) {
  let ascent = 0;
  let descent = 0;
  let run: number[] = [];
  const flush = () => {
    const c = filteredClimb(run);
    ascent += c.ascent;
    descent += c.descent;
  };
  for (const [i, p] of points.entries()) {
    if (i > 0 && p.climb) {
      if (run.length > 1) flush();
      ascent += p.climb[0];
      descent += p.climb[1];
      run = [p.ele];
    } else {
      run.push(p.ele);
    }
  }
  if (run.length > 1) flush();
  return { ascent: Math.round(ascent), descent: Math.round(descent) };
}

function leg(
  points: (TrackPoint & { ele: number })[],
  km: number,
  profile: Profile,
): Leg {
  const surfaceKm: Surface = { paved: 0, gravel: 0, unpaved: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a?.surface || !b) continue;
    const d = distanceKm(a.coord, b.coord);
    surfaceKm.paved += a.surface.paved * d;
    surfaceKm.gravel += a.surface.gravel * d;
    surfaceKm.unpaved += a.surface.unpaved * d;
  }
  const { ascent, descent } = climb(points);
  const shape = simplifyTrack(points);
  return {
    from: points[0]?.coord ?? [0, 0],
    to: points.at(-1)?.coord ?? [0, 0],
    geometry: encodeLine(shape.map((p) => p.coord)),
    elevation: shape.map((p) => Math.round(p.ele ?? 0)),
    distance: Math.round(km * 1000),
    ascent,
    descent,
    surface: {
      paved: km ? surfaceKm.paved / km : 0,
      gravel: km ? surfaceKm.gravel / km : 0,
      unpaved: km ? surfaceKm.unpaved / km : 0,
    },
    provider: IMPORT_PROVIDER,
    profileHash: profile,
  };
}

/** One imported day, ready to become a stage. */
export type ImportedDay = {
  start: Place;
  end: Place;
  legs: Leg[];
  hotel?: Hotel;
};

export type ImportParts = {
  id: string;
  now: Date;
  name: string;
  days: ImportedDay[];
  profile: Profile;
  hotelBudget?: HotelBudget;
  startDate?: string;
  startTime: string;
};

/**
 * A trip from imported days. Every stop is locked: the user chose it. The
 * imported stages are also the proposal, so Revert goes back to them.
 */
export function importedTrip(p: ImportParts): Trip {
  const stages: Stage[] = p.days.map((day, i) => ({
    id: `stage-${i + 1}`,
    start: day.start,
    end: { ...day.end, locked: true, alternatives: [] },
    via: [],
    ...(day.hotel && i < p.days.length - 1 ? { hotel: day.hotel } : {}),
    legs: day.legs,
    stats: statsFromLegs(day.legs),
  }));
  const first = stages[0]?.start.coord;
  const last = stages.at(-1)?.end.coord;
  const loop = !!first && !!last && distanceKm(first, last) <= LOOP_KM;
  const stamp = p.now.toISOString();
  return {
    schemaVersion: TRIP_SCHEMA_VERSION,
    id: p.id,
    name: p.name,
    owner: "me",
    createdAt: stamp,
    updatedAt: stamp,
    kind: loop
      ? stages.length > 1
        ? "multi-day-loop"
        : "day-loop"
      : "one-way",
    ...(p.startDate ? { startDate: p.startDate } : {}),
    settings: {
      profile: p.profile,
      kmPerDay: Math.max(1, ...stages.map((s) => s.stats.distance / 1000)),
      maxAscentPerDay: Math.max(1, ...stages.map((s) => s.stats.ascent)),
      ...(p.hotelBudget ? { hotelBudget: p.hotelBudget } : {}),
      startTime: p.startTime,
      avgSpeed: 18,
    },
    stages,
    proposed: stages,
    sharedWith: [],
    trains: [],
    savedHotels: [],
  };
}
