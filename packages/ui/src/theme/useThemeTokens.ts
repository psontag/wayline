import { useMemo } from "react";
import { useTheme } from "./ThemeProvider";

const colorTokens = {
  bg: "bg",
  surface: "surface",
  text: "text",
  textMuted: "text-muted",
  border: "border",
  accent: "accent",
  route: "route",
  routeCasing: "route-casing",
  routeDimmed: "route-dimmed",
  routeSelected: "route-selected",
  stageA: "stage-a",
  stageB: "stage-b",
  routeBest: "route-best",
  routeNature: "route-nature",
  routeFlat: "route-flat",
  routeHilly: "route-hilly",
  routeSights: "route-sights",
  routeOutline: "route-outline",
  hillshadeShadow: "hillshade-shadow",
  hillshadeHighlight: "hillshade-highlight",
  marker: "marker",
  viaPoint: "via-point",
  network: "network",
  terrainPaved: "terrain-paved",
  terrainGravel: "terrain-gravel",
  terrainUnpaved: "terrain-unpaved",
} as const;

export type ThemeTokens = Record<keyof typeof colorTokens, string>;

// A probe element resolves each token to rgb() for the current theme.
function readTokens(): ThemeTokens {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const tokens = {} as ThemeTokens;
  for (const [key, name] of Object.entries(colorTokens)) {
    probe.style.color = `var(--color-${name})`;
    tokens[key as keyof ThemeTokens] = style.color;
  }
  probe.remove();
  return tokens;
}

/** Resolved color tokens for the map and charts. Updates on theme change. */
export function useThemeTokens(): ThemeTokens {
  const { resolvedTheme } = useTheme();
  // resolvedTheme is only the trigger to read the variables again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readTokens(), [resolvedTheme]);
}
