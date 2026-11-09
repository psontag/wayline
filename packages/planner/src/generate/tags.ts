import type { GenerateRequest, RouteTag, Trip } from "@wayline/domain";
import type { Graph, PathStep } from "../graph/Graph";
import { themeValue, wayQuality } from "./theme";

/** Share of km a route needs for each tag. */
const MIN_SHARE = {
  nature: 0.5,
  water: 0.4,
  wine: 0.05,
  sights: 0.6,
  urban: 0.25,
  quiet: 0.9,
  mainRoads: 0.15,
  gravel: 0.3,
};
/** Under this share of km on signed routes. */
const OFF_ROUTES = 0.5;
/** Meters climbed per km. */
const FLAT_MAX = 1.5;
const HILLY_MIN = 8;
const CLIMBS_MIN = 12;
/** A day climbing this share of its max ascent makes a route hilly. */
const NEAR_MAX_ASCENT = 0.9;
/** Longer or shorter than the target by this share. */
const OFF_TARGET = 0.1;
/** A stage may pass its max ascent by this factor: routing changes it a bit. */
const ASCENT_MARGIN = 1.05;
/** Way quality of a quiet, paved edge and of gravel. See wayQuality. */
const QUIET_QUALITY = 0.95;
const GRAVEL_QUALITY = 0.78;
/** Landscape tags a scenic route has at least. */
const SCENIC_LANDSCAPES = 2;

/**
 * Tags of a finished proposal. Scenery and ways come from the graph path,
 * length and climbing from the trip, since routing can change them.
 */
export function routeTags(
  graph: Graph,
  steps: PathStep[],
  trip: Trip,
  urbanNodes: Set<number>,
  request: GenerateRequest,
  /** Missing when the trip has no length to keep to. */
  targetKm: number | undefined,
): RouteTag[] {
  let km = 0;
  let quiet = 0;
  let gravel = 0;
  let main = 0;
  let urban = 0;
  let signed = 0;
  for (const s of steps) {
    const e = graph.edge(s.edge);
    const quality = wayQuality(e);
    km += e.lengthKm;
    if (quality > QUIET_QUALITY) quiet += e.lengthKm;
    else if (quality > GRAVEL_QUALITY) gravel += e.lengthKm;
    else main += e.lengthKm;
    if (e.routes.length > 0) signed += e.lengthKm;
    if (urbanNodes.has(e.from) && urbanNodes.has(e.to)) urban += e.lengthKm;
  }
  if (km === 0) return [];

  const has = (share: number, min: number) => share / km >= min;
  const landscape: RouteTag[] = [];
  if (themeValue(graph, steps, "nature") >= MIN_SHARE.nature)
    landscape.push("nature");
  if (themeValue(graph, steps, "water") >= MIN_SHARE.water)
    landscape.push("water");
  if (themeValue(graph, steps, "wine") >= MIN_SHARE.wine)
    landscape.push("wine");
  if (themeValue(graph, steps, "culture") >= MIN_SHARE.sights)
    landscape.push("sights");
  const isQuiet = has(quiet, MIN_SHARE.quiet);
  const isUrban = has(urban, MIN_SHARE.urban);

  const tags = [...landscape];
  if (isUrban) tags.push("urban");
  if (landscape.length >= SCENIC_LANDSCAPES && isQuiet && !isUrban)
    tags.push("scenic");
  if (isQuiet) tags.push("quiet");
  if (has(main, MIN_SHARE.mainRoads)) tags.push("mainRoads");
  if (has(gravel, MIN_SHARE.gravel)) tags.push("gravel");
  if (signed / km < OFF_ROUTES) tags.push("offRoutes");

  const distance = trip.stages.reduce((sum, s) => sum + s.stats.distance, 0);
  const ascent = trip.stages.reduce((sum, s) => sum + s.stats.ascent, 0);
  const perKm = distance ? ascent / (distance / 1000) : 0;
  const dayMax = (i: number) =>
    request.maxAscentPerDay * (request.dayShares?.[i] ?? 1);
  const nearMax = trip.stages.some(
    (s, i) => s.stats.ascent >= dayMax(i) * NEAR_MAX_ASCENT,
  );
  if (perKm <= FLAT_MAX) tags.push("flat");
  if (perKm >= CLIMBS_MIN) tags.push("climbs");
  else if (perKm >= HILLY_MIN || nearMax) tags.push("hilly");

  if (targetKm) {
    const off = distance / 1000 / targetKm - 1;
    if (off >= OFF_TARGET) tags.push("longer");
    if (off <= -OFF_TARGET) tags.push("shorter");
  }
  const over = trip.stages.some(
    (s, i) => s.stats.ascent > dayMax(i) * ASCENT_MARGIN,
  );
  if (over) tags.push("moreClimbing");
  return tags;
}

export type SceneryTag = Extract<
  RouteTag,
  "nature" | "water" | "wine" | "sights" | "flat" | "hilly" | "climbs"
>;

/**
 * Landscape and terrain tags from scenery shares of a whole route, as
 * route-stations.json has them. Same thresholds as routeTags. Nature takes
 * the larger of forest and half the nature share, about as themeValue does
 * per edge.
 */
export function sceneryTags(
  scenery:
    | {
        forest: number;
        water: number;
        vineyard: number;
        nature: number;
        sights: number;
      }
    | undefined,
  ascentPerKm: number,
): SceneryTag[] {
  const tags: SceneryTag[] = [];
  if (scenery) {
    if (Math.max(scenery.forest, 0.5 * scenery.nature) >= MIN_SHARE.nature)
      tags.push("nature");
    if (scenery.water >= MIN_SHARE.water) tags.push("water");
    if (scenery.vineyard >= MIN_SHARE.wine) tags.push("wine");
    if (scenery.sights >= MIN_SHARE.sights) tags.push("sights");
  }
  if (ascentPerKm <= FLAT_MAX) tags.push("flat");
  else if (ascentPerKm >= CLIMBS_MIN) tags.push("climbs");
  else if (ascentPerKm >= HILLY_MIN) tags.push("hilly");
  return tags;
}
