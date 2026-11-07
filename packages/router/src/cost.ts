import type { Profile, Surface } from "@wayline/domain";
import { at } from "./tiles";

// Edge attributes, as pipeline/routing.py writes them.
export const bitsOf = (b: number) => ({
  highway: b & 31,
  grade: (b >> 5) & 7,
  paved: (b >> 8) & 1,
  unpaved: (b >> 9) & 1,
  bike: (b >> 10) & 1,
  signed: (b >> 11) & 1,
  forward: (b >> 12) & 1,
  backward: (b >> 13) & 1,
});

/** Classes 0 (none) to 6, as pipeline/routing.py writes them. */
export const estimatesOf = (e: number) => ({
  forest: e & 7,
  water: (e >> 3) & 7,
  town: (e >> 6) & 7,
  traffic: (e >> 9) & 7,
  noise: (e >> 12) & 7,
});

/** Added cost per meter by class 0-6, from the BRouter profiles. */
const PENALTY = {
  forest: [1, 0.5, 0.4, 0.25, 0.15, 0.1, 0],
  water: [2, 1.3, 1, 0.7, 0.4, 0.1, 0],
  town: [0, 0.5, 0.9, 1.2, 1.3, 1.4, 1.6],
  traffic: [0, 0.2, 0.2, 0.4, 0.6, 0.8, 1],
  noise: [0, 0.3, 0.5, 0.8, 1.4, 1.7, 2],
};

/** Cost of getting on a ferry, in meters. */
export const FERRY_COST = 10_000;
const FERRY_FACTOR = 5.67;

/** A full U-turn costs 2 × this. */
export const TURN_COST = 90;

/** The switches of the BRouter profiles in infra/brouter/profiles that change way costs. */
export type CostProfile = {
  /** Signed routes cost 1 per meter and have no turn cost. */
  cycleRoutes: boolean;
  /** Roads without a bike lane or bike access cost 2 more. */
  avoidUnsafe: boolean;
  /** Per meter of descent beyond BRouter's downhill cutoff. */
  downhillCost: number;
  /** Prefers forest and water, avoids towns. */
  scenery: boolean;
  /** Avoids traffic and noise. */
  quiet: boolean;
};

export const TOURING: CostProfile = {
  cycleRoutes: true,
  avoidUnsafe: true,
  downhillCost: 60,
  scenery: false,
  quiet: false,
};

export const COST_PROFILES: Record<Profile, CostProfile> = {
  touring: TOURING,
  fast: { ...TOURING, cycleRoutes: false, avoidUnsafe: false, downhillCost: 0 },
  scenic: { ...TOURING, scenery: true },
  quiet: { ...TOURING, quiet: true },
};

const MAIN_ROADS: Record<string, [bike: number, noBike: number]> = {
  trunk: [1.5, 10],
  trunk_link: [1.5, 10],
  primary: [1.2, 3],
  primary_link: [1.2, 3],
  secondary: [1.1, 1.6],
  secondary_link: [1.1, 1.6],
  tertiary: [1, 1.4],
  tertiary_link: [1, 1.4],
  unclassified: [1, 1.3],
};
const MINOR_WAYS = new Set(["track", "road", "path", "footway"]);
// By track grade, 0 (none) to 5.
const GOOD_MINOR = [1, 1, 1.1, 1.5, 2, 3];
const POOR_MINOR = [5, 1.3, 2, 3, 5, 5];

/**
 * Cost per meter of an edge, ported from the way costs of BRouter's profiles
 * (infra/brouter/profiles). 1 is the best way.
 */
export function wayFactor(
  bits: number,
  highways: string[],
  profile: CostProfile = TOURING,
  estimates = 0,
): number {
  return baseFactor(bits, highways, profile) + penalty(estimates, profile);
}

function penalty(estimates: number, profile: CostProfile) {
  const c = estimatesOf(estimates);
  let p = 0;
  if (profile.scenery)
    p +=
      at(PENALTY.forest, c.forest) +
      at(PENALTY.water, c.water) +
      at(PENALTY.town, c.town);
  if (profile.quiet)
    p += at(PENALTY.traffic, c.traffic) + at(PENALTY.noise, c.noise);
  return p;
}

function baseFactor(bits: number, highways: string[], profile: CostProfile) {
  const b = bitsOf(bits);
  const hw = highways[b.highway];
  if (hw === "ferry") return FERRY_FACTOR;
  if (b.signed && profile.cycleRoutes) return 1;
  const goodSurface = b.paved && (b.bike || hw === "footway") && !b.unpaved;
  let f: number;
  if (hw === "pedestrian") f = b.bike ? 2.2 : 3;
  else if (hw === "bridleway") f = 5;
  else if (hw === "cycleway") f = 1;
  else if (hw === "residential" || hw === "living_street")
    f = b.unpaved ? 1.5 : 1.1;
  else if (hw === "service") f = b.unpaved ? 1.6 : 1.3;
  else if (hw && MINOR_WAYS.has(hw))
    f = (goodSurface ? GOOD_MINOR : POOR_MINOR)[b.grade] ?? 5;
  else {
    const road = hw ? MAIN_ROADS[hw] : undefined;
    f =
      (b.bike || !profile.avoidUnsafe ? 0 : 2) +
      (road ? road[b.bike ? 0 : 1] : 2);
  }
  return f + 0.05;
}

/** Surface class of an edge, close to what parseBrouterLeg reads from BRouter's way tags. */
export function surfaceOf(bits: number, highways: string[]): keyof Surface {
  const b = bitsOf(bits);
  const hw = highways[b.highway];
  if (b.paved || b.grade === 1) return "paved";
  if (b.grade === 2) return "gravel";
  if (b.grade >= 3 || hw === "bridleway") return "unpaved";
  if (b.unpaved || hw === "track" || hw === "path") return "gravel";
  return "paved";
}
