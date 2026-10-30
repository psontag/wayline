import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { Badge } from "./Chip";
import { type RouteColor, routeColorClasses } from "./RouteLabel";

export type ProposalStat = { value: string; label: string };

export type ProposalDay = {
  /** "1" */
  label: string;
  /** Where the day ends, e.g. "Bergrheinfeld". */
  place: string;
  /** "65 km" */
  distance: string;
  /** Short note, e.g. "Half day". */
  tag?: string;
};

export type ProposalCardProps = {
  /** Same number as on the map. */
  number: number;
  title: string;
  /** Small line under the title, e.g. "Via Haßfurt and Schweinfurt". */
  subtitle?: string;
  /** Route color of the number, as on the map. */
  color?: RouteColor;
  /** Short badges, e.g. "Flattest". */
  tags?: string[];
  /** Three stats. A compact card shows their values in one line. */
  stats: ProposalStat[];
  /** Shown when selected, below the stats. */
  chart?: ReactNode;
  /** Shown when selected. One row per day. */
  days?: ProposalDay[];
  /** Shown when selected, e.g. the main routes. */
  footer?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Called with true when the pointer enters, false when it leaves. */
  onHover?: (hover: boolean) => void;
  /** Called with the day number (from 1) under the pointer, or undefined. */
  onHoverDay?: (day: number | undefined) => void;
  /** Shown at the bottom when selected, e.g. actions. */
  children?: ReactNode;
};

/** One generated trip in the proposals list. Only the selected one is open. */
export function ProposalCard({
  number,
  title,
  subtitle,
  color,
  tags = [],
  stats,
  chart,
  days = [],
  footer,
  selected = false,
  onSelect,
  onHover,
  onHoverDay,
  children,
}: ProposalCardProps) {
  return (
    <article
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        "flex flex-col rounded-md border transition-colors",
        selected
          ? "border-selected-border bg-selected"
          : "border-border bg-surface hover:border-text-muted hover:bg-hover",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex items-center gap-2.5 rounded-md p-3 text-left text-text",
          focusRing,
        )}
      >
        <NumberBadge number={number} color={color} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-md font-bold">
              {title}
            </span>
            {tags.map((tag) => (
              <Badge key={tag} className="shrink-0">
                {tag}
              </Badge>
            ))}
          </span>
          <span className="truncate text-xs text-text-muted tabular-nums">
            {selected ? subtitle : stats.map((s) => s.value).join(" · ")}
          </span>
        </span>
      </button>
      {selected && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <span className="grid grid-cols-3 gap-1.5 tabular-nums">
            {stats.map((stat) => (
              <span key={stat.label} className="flex min-w-0 flex-col">
                <span className="font-bold whitespace-nowrap">
                  {stat.value}
                </span>
                <span className="truncate text-2xs text-text-muted">
                  {stat.label}
                </span>
              </span>
            ))}
          </span>
          {chart}
          {days.length > 0 && (
            <ol className="flex flex-col gap-1 text-sm">
              {days.map((day, i) => (
                <li
                  key={day.label}
                  onMouseEnter={() => onHoverDay?.(i + 1)}
                  onMouseLeave={() => onHoverDay?.(undefined)}
                  className="-mx-1 flex items-center gap-2 rounded-sm px-1 hover:bg-hover"
                >
                  <span className="w-4 shrink-0 text-xs text-text-muted tabular-nums">
                    {day.label}
                  </span>
                  <span className="min-w-0 truncate font-semibold">
                    {day.place}
                  </span>
                  {day.tag && <Badge className="shrink-0">{day.tag}</Badge>}
                  <span className="ml-auto shrink-0 text-text-muted tabular-nums">
                    {day.distance}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {footer && <span className="text-xs text-text-muted">{footer}</span>}
          {children}
        </div>
      )}
    </article>
  );
}

function NumberBadge({
  number,
  color,
}: {
  number: number;
  color?: RouteColor;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums",
        color
          ? [routeColorClasses[color], "text-on-route"]
          : "bg-hover text-text",
      )}
    >
      {number}
    </span>
  );
}

/** Placeholder for a proposal that is still being searched. */
export function ProposalCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex items-center gap-2.5 rounded-md border border-dashed border-border p-3 motion-safe:animate-pulse"
    >
      <span className="size-7 shrink-0 rounded-full bg-hover" />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="h-3 w-1/2 rounded-sm bg-hover" />
        <span className="h-2.5 w-4/5 rounded-sm bg-hover" />
      </span>
    </div>
  );
}
