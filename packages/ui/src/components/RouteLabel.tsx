import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

/** Route colors, one per proposal in list order. */
export const routeColors = [
  "route1",
  "route2",
  "route3",
  "route4",
  "route5",
  "route6",
  "route7",
  "route8",
] as const;
export type RouteColor = (typeof routeColors)[number];

/** Background class for each route color, e.g. for a color dot. */
export const routeColorClasses: Record<RouteColor, string> = {
  route1: "bg-route-1",
  route2: "bg-route-2",
  route3: "bg-route-3",
  route4: "bg-route-4",
  route5: "bg-route-5",
  route6: "bg-route-6",
  route7: "bg-route-7",
  route8: "bg-route-8",
};

export type RouteLabelProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "color"
> & {
  label: string;
  color: RouteColor;
  selected?: boolean;
};

/** Name of a route option on the map, in the route's color. */
export function RouteLabel({
  label,
  color,
  selected = false,
  className,
  ...props
}: RouteLabelProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap text-on-route shadow-sm transition-opacity",
        routeColorClasses[color],
        selected
          ? "opacity-100 ring-2 ring-route-outline"
          : "opacity-80 hover:opacity-100",
        focusRing,
        className,
      )}
      {...props}
    >
      {label}
    </button>
  );
}
