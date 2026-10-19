import type { ButtonHTMLAttributes, HTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  /** md is a touch-sized chip, e.g. the day picker on phones. */
  size?: "sm" | "md";
  ref?: Ref<HTMLButtonElement>;
};

/** Pill button for picking one of a few options, e.g. stop alternatives. */
export function Chip({
  selected = false,
  size = "sm",
  className,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border whitespace-nowrap tabular-nums transition-colors",
        "[&_svg]:size-3.5",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        selected || size === "md" ? "font-bold" : "font-semibold",
        selected
          ? "border-selected-border bg-selected text-text"
          : "border-border bg-surface text-text hover:bg-hover",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export type BadgeTone = "neutral" | "accent";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  /** md fits a top bar, e.g. the inputs of a search. */
  size?: "sm" | "md";
};

/** Small static label, e.g. the trip kind. */
export function Badge({
  tone = "neutral",
  size = "sm",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full whitespace-nowrap text-text",
        size === "sm"
          ? "px-2 py-0.5 text-2xs font-bold"
          : "px-2.5 py-1 text-xs font-semibold",
        tone === "neutral" ? "bg-hover" : "bg-selected",
        className,
      )}
      {...props}
    />
  );
}
