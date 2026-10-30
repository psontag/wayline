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
};

// A climb gains at least this much at this average grade.
const MIN_GAIN = 30;
const MIN_GRADE = 2;
// A point climbs when the next LOOK_KM rise at MIN_GRADE or more. Climbing
// stretches closer than JOIN_KM count as one climb.
const LOOK_KM = 0.3;
const JOIN_KM = 0.3;
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
  return runs.flatMap(([from, to]) => {
    // Trim to the lowest and highest point, so the run starts at the bottom.
    let low = from;
    for (let i = from; i <= to; i++) {
      if (at(pts, i).ele < at(pts, low).ele) low = i;
    }
    let high = low;
    for (let i = low; i <= to; i++) {
      if (at(pts, i).ele > at(pts, high).ele) high = i;
    }
    const climb = toClimb(pts, low, high);
    return climb ? [climb] : [];
  });
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
    maxGrade: Math.round(maxGrade(pts, low, high) * 10) / 10,
  };
}

function maxGrade(pts: RoutePoint[], from: number, to: number): number {
  let best = 0;
  let j = from;
  for (let i = from; i <= to; i++) {
    while (j < to && at(pts, j).km - at(pts, i).km < MAX_GRADE_KM) j++;
    const km = at(pts, j).km - at(pts, i).km;
    if (km >= MAX_GRADE_KM * 0.9) {
      best = Math.max(
        best,
        ((at(pts, j).ele - at(pts, i).ele) / (km * 1000)) * 100,
      );
    }
  }
  return best;
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
