import type { RoutePoint } from "./line";

export type Climb = {
  /** Km on the route where the climb starts and ends. */
  startKm: number;
  endKm: number;
  /** Metres gained from the lowest to the highest point. */
  gain: number;
  /** Average grade in %. */
  grade: number;
  /** Steepest 100 m in %. */
  maxGrade: number;
  /** Km of the climb steeper than STEEP_GRADE. */
  steepKm: number;
};

// A climb gains at least this much at this average grade.
const MIN_GAIN = 50;
const MIN_GRADE = 2;
// A point climbs when the next LOOK_KM rise at MIN_GRADE or more. Climbing
// stretches closer than JOIN_KM count as one climb.
const LOOK_KM = 0.3;
const JOIN_KM = 0.3;
// Climbs with a gap of at most GROUP_KM between them are one climb, unless
// the road loses GROUP_DIP metres or more in the gap.
const GROUP_KM = 1.5;
const GROUP_DIP = 25;
/** Grade in % above which a stretch counts as steep. */
export const STEEP_GRADE = 7;
// Elevation is smoothed over this many km, so noise does not count.
const SMOOTH_KM = 0.2;
const MAX_GRADE_KM = 0.1;

// Indices always stay within the array.
const at = (pts: RoutePoint[], i: number) => pts[i] as RoutePoint;

/** Climbs along the route, in order. */
export function findClimbs(points: RoutePoint[]): Climb[] {
  const pts = smooth(points);
  // Stretches [from, to] of points that climb.
  const runs: [number, number][] = [];
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (j < pts.length - 1 && at(pts, j).km - at(pts, i).km < LOOK_KM) j++;
    const km = at(pts, j).km - at(pts, i).km;
    if (km <= 0) break;
    const grade = ((at(pts, j).ele - at(pts, i).ele) / (km * 1000)) * 100;
    if (grade < MIN_GRADE) continue;
    const last = runs.at(-1);
    if (last && at(pts, i).km - at(pts, last[1]).km <= JOIN_KM) {
      last[1] = Math.max(last[1], j);
    } else {
      runs.push([i, j]);
    }
  }
  // Trim each run to its lowest and highest point, so it starts at the bottom.
  const spans = runs.map(([from, to]) => {
    const low = lowest(pts, from, to);
    return [low, highest(pts, low, to)] as [number, number];
  });
  const grouped: [number, number][] = [];
  for (const span of spans) {
    const last = grouped.at(-1);
    if (last && joins(pts, last, span)) {
      if (at(pts, span[1]).ele > at(pts, last[1]).ele) last[1] = span[1];
    } else {
      grouped.push(span);
    }
  }
  return grouped.flatMap(([low, high]) => {
    const climb = toClimb(pts, low, high);
    return climb ? [climb] : [];
  });
}

/** Whether the next span continues the last one after a short, shallow dip. */
function joins(
  pts: RoutePoint[],
  last: [number, number],
  next: [number, number],
): boolean {
  if (at(pts, next[0]).km - at(pts, last[1]).km > GROUP_KM) return false;
  const dip = at(pts, last[1]).ele - at(pts, lowest(pts, last[1], next[0])).ele;
  return dip < GROUP_DIP;
}

function lowest(pts: RoutePoint[], from: number, to: number): number {
  let best = from;
  for (let i = from; i <= to; i++) {
    if (at(pts, i).ele < at(pts, best).ele) best = i;
  }
  return best;
}

function highest(pts: RoutePoint[], from: number, to: number): number {
  let best = from;
  for (let i = from; i <= to; i++) {
    if (at(pts, i).ele > at(pts, best).ele) best = i;
  }
  return best;
}

function toClimb(
  pts: RoutePoint[],
  low: number,
  high: number,
): Climb | undefined {
  const a = at(pts, low);
  const b = at(pts, high);
  const gain = b.ele - a.ele;
  const km = b.km - a.km;
  if (gain < MIN_GAIN || km <= 0) return undefined;
  const grade = (gain / (km * 1000)) * 100;
  if (grade < MIN_GRADE) return undefined;
  return {
    startKm: a.km,
    endKm: b.km,
    gain: Math.round(gain),
    grade: Math.round(grade * 10) / 10,
    ...steepness(pts, low, high),
  };
}

/** Steepest 100 m, and the km where the next 100 m are steeper than STEEP_GRADE. */
function steepness(
  pts: RoutePoint[],
  from: number,
  to: number,
): { maxGrade: number; steepKm: number } {
  let best = 0;
  let steepKm = 0;
  let j = from;
  for (let i = from; i < to; i++) {
    while (j < to && at(pts, j).km - at(pts, i).km < MAX_GRADE_KM) j++;
    const km = at(pts, j).km - at(pts, i).km;
    if (km < MAX_GRADE_KM * 0.9) continue;
    const grade = ((at(pts, j).ele - at(pts, i).ele) / (km * 1000)) * 100;
    best = Math.max(best, grade);
    if (grade > STEEP_GRADE) steepKm += at(pts, i + 1).km - at(pts, i).km;
  }
  return {
    maxGrade: Math.round(best * 10) / 10,
    steepKm: Math.round(steepKm * 100) / 100,
  };
}

/** Moving average of the elevation over SMOOTH_KM. */
function smooth(points: RoutePoint[]): RoutePoint[] {
  let from = 0;
  let to = 0;
  let sum = 0;
  return points.map((p) => {
    while (to < points.length && at(points, to).km - p.km <= SMOOTH_KM / 2) {
      sum += at(points, to).ele;
      to++;
    }
    while (p.km - at(points, from).km > SMOOTH_KM / 2) {
      sum -= at(points, from).ele;
      from++;
    }
    return { ...p, ele: sum / (to - from) };
  });
}
