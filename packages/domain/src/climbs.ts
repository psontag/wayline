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
const MIN_GRADE = 3;
// A dip ends a climb when it drops more than this, in m or as a share of
// the gain so far.
const MAX_DIP = 10;
const MAX_DIP_SHARE = 0.2;
// Elevation is smoothed over this many km, so noise does not count.
const SMOOTH_KM = 0.2;
const MAX_GRADE_KM = 0.1;

/** Climbs along the route, in order. */
export function findClimbs(points: RoutePoint[]): Climb[] {
  const pts = smooth(points);
  const climbs: Climb[] = [];
  let low = 0;
  let high = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    // Still at the bottom: the climb starts at the last low point.
    if (high === low && p.ele <= pts[low]!.ele) {
      low = i;
      high = i;
      continue;
    }
    // Only a real rise moves the top, so a flat top does not count.
    if (p.ele > pts[high]!.ele) {
      high = i;
      continue;
    }
    const gain = pts[high]!.ele - pts[low]!.ele;
    const dip = pts[high]!.ele - p.ele;
    if (
      dip > Math.max(MAX_DIP, gain * MAX_DIP_SHARE) ||
      p.ele <= pts[low]!.ele
    ) {
      const climb = toClimb(pts, low, high);
      if (climb) climbs.push(climb);
      low = i;
      high = i;
    }
  }
  const last = toClimb(pts, low, high);
  if (last) climbs.push(last);
  return climbs;
}

function toClimb(
  pts: RoutePoint[],
  low: number,
  high: number,
): Climb | undefined {
  const a = pts[low]!;
  const b = pts[high]!;
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
    while (j < to && pts[j]!.km - pts[i]!.km < MAX_GRADE_KM) j++;
    const km = pts[j]!.km - pts[i]!.km;
    if (km >= MAX_GRADE_KM * 0.9) {
      best = Math.max(best, ((pts[j]!.ele - pts[i]!.ele) / (km * 1000)) * 100);
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
    while (to < points.length && points[to]!.km - p.km <= SMOOTH_KM / 2) {
      sum += points[to]!.ele;
      to++;
    }
    while (p.km - points[from]!.km > SMOOTH_KM / 2) {
      sum -= points[from]!.ele;
      from++;
    }
    return { ...p, ele: sum / (to - from) };
  });
}
