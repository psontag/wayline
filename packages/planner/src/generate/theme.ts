import type { NetworkEdge, Theme } from "@wayline/domain";
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

/** Score factor for an edge: 1 without a theme. */
export function themeBoost(edge: NetworkEdge, theme?: Theme): number {
  return theme ? 1 + THEME_WEIGHT * themeShare(edge, theme) : 1;
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
