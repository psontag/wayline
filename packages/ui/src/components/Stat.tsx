import { type StatIcon, statIcons } from "../icons";
import { cn } from "../lib/cn";
import { Tooltip } from "./Tooltip";

export type StatProps = {
  icon: StatIcon;
  value: string;
  /** Tooltip and accessible name of the icon, e.g. "Distance". */
  label: string;
  size?: "sm" | "md";
  /** Secondary info, e.g. in a hotel row. */
  muted?: boolean;
  className?: string;
};

/** A muted icon and a value, e.g. "↔ 78 km". */
export function Stat({
  icon,
  value,
  label,
  size = "md",
  muted = false,
  className,
}: StatProps) {
  const Icon = statIcons[icon];
  return (
    <Tooltip label={label}>
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap tabular-nums",
          size === "md" ? "gap-1.5 text-base" : "gap-1 text-xs",
          muted
            ? "font-normal text-text-muted"
            : size === "md"
              ? "font-bold text-text"
              : "font-semibold text-text",
          className,
        )}
      >
        <Icon
          role="img"
          aria-label={label}
          className={cn(
            "shrink-0 text-text-muted",
            size === "md" ? "size-4" : "size-3.5",
          )}
        />
        {value}
      </span>
    </Tooltip>
  );
}
