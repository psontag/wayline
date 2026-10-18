import type { ButtonHTMLAttributes, HTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** Pill button for picking one of a few options, e.g. stop alternatives. */
export function Chip({ selected = false, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs whitespace-nowrap tabular-nums transition-colors",
        "[&_svg]:size-3.5",
        selected
          ? "border-selected-border bg-selected font-bold text-text"
          : "border-border bg-surface font-semibold text-text hover:bg-hover",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export type BadgeTone = "neutral" | "accent";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

/** Small static label, e.g. the trip kind. */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold whitespace-nowrap text-text",
        tone === "neutral" ? "bg-hover" : "bg-selected",
        className,
      )}
      {...props}
    />
  );
}
