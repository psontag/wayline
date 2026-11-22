import { type RouteColor, routeColors } from "@wayline/ui";

/** Color of a proposal, by its place in the list. Also its theme token. */
export function routeColorAt(index: number): RouteColor {
  return routeColors[index % routeColors.length] ?? "route1";
}

/** Letter of a proposal, by its place in the list: A, B, C. Stops have numbers. */
export function proposalLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}
