import { type RouteColor, routeColors } from "@wayline/ui";

/** Color of a proposal, by its place in the list. Also its theme token. */
export function routeColorAt(index: number): RouteColor {
  return routeColors[index % routeColors.length] ?? "route1";
}
