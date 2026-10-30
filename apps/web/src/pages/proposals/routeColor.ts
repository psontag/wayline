import type { Proposal } from "@wayline/domain";
import type { RouteColor, ThemeTokens } from "@wayline/ui";

export type RouteColorKey = RouteColor;

/** Colors in list order, for proposals without a flavour. */
export const routeColorKeys: readonly RouteColorKey[] = [
  "best",
  "nature",
  "flat",
  "hilly",
  "sights",
];

/** The proposal's flavour, if it has one we know. */
export function flavourOf(proposal: Proposal): RouteColorKey | undefined {
  // Read as optional, so this works with and without flavour on Proposal.
  const { flavour } = proposal as { flavour?: unknown };
  return routeColorKeys.find((key) => key === flavour);
}

/** Color of a proposal: its flavour, or its place in the list. */
export function routeColorKey(
  proposal: Proposal,
  index: number,
): RouteColorKey {
  return (
    flavourOf(proposal) ??
    routeColorKeys[index % routeColorKeys.length] ??
    "best"
  );
}

/** Theme token of each route color, for map layers. */
export const routeColorToken: Record<RouteColorKey, keyof ThemeTokens> = {
  best: "routeBest",
  nature: "routeNature",
  flat: "routeFlat",
  hilly: "routeHilly",
  sights: "routeSights",
};
