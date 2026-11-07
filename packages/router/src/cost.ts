import type { Profile, Surface } from "@wayline/domain";

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
};

export const TOURING: CostProfile = {
  cycleRoutes: true,
  avoidUnsafe: true,
  downhillCost: 60,
};

export const COST_PROFILES: Record<Profile, CostProfile> = {
  touring: TOURING,
  fast: { cycleRoutes: false, avoidUnsafe: false, downhillCost: 0 },
  // Touring plus scenery and traffic costs, which the tiles don't have yet.
  scenic: TOURING,
  quiet: TOURING,
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
): number {
  const b = bitsOf(bits);
  if (b.signed && profile.cycleRoutes) return 1;
  const hw = highways[b.highway];
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
