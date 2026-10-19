import type { Leg, Stage, Stats, Surface } from "./schema";

/** Sum of the legs. Surface shares are weighted by distance. */
export function statsFromLegs(legs: Leg[]): Stats {
  const stats: Stats = {
    distance: 0,
    ascent: 0,
    descent: 0,
    surface: { paved: 0, gravel: 0, unpaved: 0 },
  };
  for (const leg of legs) {
    stats.distance += leg.distance;
    stats.ascent += leg.ascent;
    stats.descent += leg.descent;
    for (const key of surfaceKeys) {
      stats.surface[key] += leg.surface[key] * leg.distance;
    }
  }
  for (const key of surfaceKeys) {
    stats.surface[key] = stats.distance
      ? stats.surface[key] / stats.distance
      : 0;
  }
  return stats;
}

/** Totals of the whole trip. */
export function tripStats(stages: Stage[]): Stats {
  return statsFromLegs(stages.flatMap((s) => s.legs));
}

const surfaceKeys: (keyof Surface)[] = ["paved", "gravel", "unpaved"];
