import type { NetworkEdge, Theme } from "@wayline/domain";
import type { Graph, PathStep } from "../graph/Graph";

/** How much a fully themed edge raises its score. */
export const THEME_WEIGHT = 0.8;
/** Sights per km that count as a fully themed edge. */
const SIGHTS_PER_KM = 0.5;
/** Vineyards are rare along routes, so a smaller share counts fully. */
const VINEYARD_FULL = 0.5;

/** 0 to 1: how well an edge fits the theme. 0 without scenery data. */
export function themeShare(edge: NetworkEdge, theme: Theme): number {
  const s = edge.scenery;
  if (!s) return 0;
  switch (theme) {
    case "nature":
      return Math.max(s.forest, s.nature);
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
 * What a path has of the theme, as shown on the proposal: share of km for
 * nature, water and wine, number of sights for culture.
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
    if (theme === "culture") value += s.sights;
    else if (theme === "wine") value += s.vineyard * e.lengthKm;
    else value += themeShare(e, theme) * e.lengthKm;
  }
  if (theme === "culture") return value;
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
