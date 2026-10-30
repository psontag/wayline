import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type RouteColor = "best" | "nature" | "flat" | "hilly" | "sights";

/** Background class for each route color, e.g. for a color dot. */
export const routeColorClasses: Record<RouteColor, string> = {
  best: "bg-route-best",
  nature: "bg-route-nature",
  flat: "bg-route-flat",
  hilly: "bg-route-hilly",
  sights: "bg-route-sights",
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
