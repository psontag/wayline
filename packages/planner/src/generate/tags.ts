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
const HILLY_MIN = 5;
const CLIMBS_MIN = 8;
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
  if (perKm <= FLAT_MAX) tags.push("flat");
  if (perKm >= CLIMBS_MIN) tags.push("climbs");
  else if (perKm >= HILLY_MIN) tags.push("hilly");

  if (targetKm) {
    const off = distance / 1000 / targetKm - 1;
    if (off >= OFF_TARGET) tags.push("longer");
    if (off <= -OFF_TARGET) tags.push("shorter");
  }
  const over = trip.stages.some(
    (s, i) =>
      s.stats.ascent >
      request.maxAscentPerDay * (request.dayShares?.[i] ?? 1) * ASCENT_MARGIN,
  );
  if (over) tags.push("moreClimbing");
  return tags;
}
