import type { Surface } from "@wayline/domain";

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

/** Cost per meter of descent beyond BRouter's downhill cutoff. */
export const DOWNHILL_COST = 60;
/** A full U-turn costs 2 × this. None on signed routes. */
export const TURN_COST = 90;

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
 * Cost per meter of an edge, ported from the way costs of BRouter's touring
 * profile (infra/brouter/profiles/touring.brf). 1 is the best way.
 */
export function wayFactor(bits: number, highways: string[]): number {
  const b = bitsOf(bits);
  if (b.signed) return 1;
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
    f = (b.bike ? 0 : 2) + (road ? road[b.bike ? 0 : 1] : 2);
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
