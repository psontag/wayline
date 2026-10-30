import type {
  Flavour,
  NetworkClass,
  NetworkEdge,
  Theme,
} from "@wayline/domain";
import type { Graph, PathStep } from "../graph/Graph";

/** How much a fully themed edge raises its score. */
export const THEME_WEIGHT = 1.2;
/** Weight of nature reserves and parks next to forest. */
const NATURE_PARK = 0.5;
/** Sights per km that count as a fully themed edge. */
const SIGHTS_PER_KM = 0.5;
/** Vineyards are rare along routes (1–2 % of km), so a smaller share counts fully. */
const VINEYARD_FULL = 0.25;

/** 0 to 1: how well an edge fits the theme. 0 without scenery data. */
export function themeShare(edge: NetworkEdge, theme: Theme): number {
  const s = edge.scenery;
  if (!s) return 0;
  switch (theme) {
    case "nature":
      // Nature parks include towns, so they count half.
      return Math.max(s.forest, NATURE_PARK * s.nature);
    case "water":
      return s.water;
    case "wine":
      return Math.min(1, s.vineyard / VINEYARD_FULL);
    case "culture":
      return Math.min(
        1,
        s.sights / Math.max(edge.lengthKm, 0.5) / SIGHTS_PER_KM,
      );
  }
}

/** Network part of the edge score. Same as NETWORK_SCORE in pipeline/graph.py. */
const NETWORK_SCORE: Record<NetworkClass, number> = {
  icn: 1,
  ncn: 0.95,
  rcn: 0.85,
  lcn: 0.75,
  connector: 0.4,
};

/**
 * 0 to 1: the surface and main-road part of the edge score. 1 is paved
 * and quiet, gravel is 0.85, a main road 0.7.
 */
export function wayQuality(edge: NetworkEdge): number {
  return Math.min(1, edge.score / NETWORK_SCORE[edge.network]);
}

/**
 * Score factor for an edge with this share of scenery. The boost shrinks
 * with the square of the way quality, so scenery on gravel or next to a
 * main road does not beat a paved, quiet way with a bit less scenery.
 */
export function sceneryBoost(edge: NetworkEdge, share: number): number {
  return 1 + THEME_WEIGHT * share * wayQuality(edge) ** 2;
}

/** Score factor for an edge: 1 without a theme. */
export function themeBoost(edge: NetworkEdge, theme?: Theme): number {
  return theme ? sceneryBoost(edge, themeShare(edge, theme)) : 1;
}

/** Flavours that lean toward scenery. */
export type SceneryFlavour = Extract<Flavour, "nature" | "sights">;

/**
 * 0 to 1: how well an edge fits a scenery flavour. Nature joins forest,
 * reserves and water. Sights joins culture and wine.
 */
export function flavourShare(edge: NetworkEdge, flavour: SceneryFlavour) {
  if (flavour === "sights") {
    return Math.max(themeShare(edge, "culture"), themeShare(edge, "wine"));
  }
  const green = themeShare(edge, "nature");
  const water = themeShare(edge, "water");
  return 1 - (1 - green) * (1 - water);
}

/** Share of km that fits a scenery flavour. */
export function flavourValue(
  graph: Graph,
  steps: PathStep[],
  flavour: SceneryFlavour,
): number {
  let km = 0;
  let value = 0;
  for (const { edge } of steps) {
    const e = graph.edge(edge);
    km += e.lengthKm;
    value += flavourShare(e, flavour) * e.lengthKm;
  }
  return km ? value / km : 0;
}

/**
 * Share of km with the theme, as shown on the proposal. Culture counts the
 * km with a sight nearby. Wine counts vineyards, not the fit.
 */
export function themeValue(
  graph: Graph,
  steps: PathStep[],
  theme: Theme,
): number {
  let km = 0;
  let value = 0;
  for (const { edge } of steps) {
    const e = graph.edge(edge);
    const s = e.scenery;
    km += e.lengthKm;
    if (!s) continue;
    if (theme === "culture") value += s.sights > 0 ? e.lengthKm : 0;
    else if (theme === "wine") value += s.vineyard * e.lengthKm;
    else value += themeShare(e, theme) * e.lengthKm;
  }
  return km ? value / km : 0;
}

/** 0 to 1, for ranking proposals. */
export function themeFit(
  graph: Graph,
  steps: PathStep[],
  theme: Theme,
): number {
  let km = 0;
  let fit = 0;
  for (const { edge } of steps) {
    const e = graph.edge(edge);
    km += e.lengthKm;
    fit += themeShare(e, theme) * e.lengthKm;
  }
  return km ? fit / km : 0;
}
