import { distanceKm, type LonLat } from "@wayline/domain";

/** A day comes back when it passes this close to where it already was... */
export const LOOP_NEAR_KM = 5;
/** ...after riding at least this far since. Shorter bends are fine. */
export const LOOP_AFTER_KM = 20;

export type LinePoint = { coord: LonLat; km: number };

/**
 * km of one day that come back within LOOP_NEAR_KM of a point the day
 * passed LOOP_AFTER_KM or more before. A filler loop scores high, a river
 * bend scores 0.
 */
export function loopKm(day: LinePoint[]): number {
  // Grid of earlier points, with cells about LOOP_NEAR_KM wide.
  const cell = LOOP_NEAR_KM / 75;
  const key = (x: number, y: number) => `${x},${y}`;
  const grid = new Map<string, LinePoint[]>();
  let looped = 0;
  let prevKm = day[0]?.km ?? 0;
  for (const p of day) {
    const cx = Math.floor(p.coord[0] / cell);
    const cy = Math.floor(p.coord[1] / cell);
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) {
      for (let dy = -1; dy <= 1 && !near; dy++) {
        near = (grid.get(key(cx + dx, cy + dy)) ?? []).some(
          (a) =>
            p.km - a.km >= LOOP_AFTER_KM &&
            distanceKm(a.coord, p.coord) < LOOP_NEAR_KM,
        );
      }
    }
    if (near) looped += p.km - prevKm;
    prevKm = p.km;
    const list = grid.get(key(cx, cy)) ?? [];
    list.push(p);
    grid.set(key(cx, cy), list);
  }
  return looped;
}

/** A day may come back on at most this share of its km, and this many km. */
export const MAX_LOOP_SHARE = 0.1;
export const MAX_LOOP_KM = 8;

/**
 * Does a day ride a filler loop? days: the points of each day. Each day
 * is measured on its own, so a loop trip coming home is fine.
 */
export function loopsBack(days: LinePoint[][]): boolean {
  return days.some((day) => {
    const km = (day.at(-1)?.km ?? 0) - (day[0]?.km ?? 0);
    return loopKm(day) > Math.min(MAX_LOOP_SHARE * km, MAX_LOOP_KM);
  });
}

/** Points of a line with the km from its start. */
export function linePoints(coords: LonLat[]): LinePoint[] {
  let km = 0;
  return coords.map((coord, i) => {
    const prev = coords[i - 1];
    if (prev) km += distanceKm(prev, coord);
    return { coord, km };
  });
}
