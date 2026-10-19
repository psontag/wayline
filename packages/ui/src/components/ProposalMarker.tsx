import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type ProposalMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  number: number;
  selected?: boolean;
};

/** Numbered proposal on the map, so routes are not told apart by color. */
export function ProposalMarker({
  number,
  selected = false,
  className,
  ...props
}: ProposalMarkerProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "flex items-center justify-center rounded-full border-3 font-extrabold tabular-nums shadow-sm transition-colors",
        selected
          ? "size-9 border-route-casing bg-accent text-md text-on-accent"
          : "size-8 border-route-dimmed bg-surface text-base text-text hover:border-text-muted",
        focusRing,
        className,
      )}
      {...props}
    >
      {number}
    </button>
  );
}
