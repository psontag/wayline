import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import type { StatIcon } from "../icons";
import { Badge } from "./Chip";
import { DayList, type DayListItem } from "./DayList";
import { type RouteColor, routeColorClasses } from "./RouteLabel";
import { Stat } from "./Stat";
import { SurfaceBar, type SurfaceShares } from "./SurfaceBar";

export type ProposalStat = { icon: StatIcon; value: string; label: string };

export type ProposalDay = DayListItem;

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
  /** Three stats. A compact card shows them in one line. */
  stats: ProposalStat[];
  /** Shown as a surface bar under the stats when selected. */
  surface?: SurfaceShares;
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
  surface,
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
          {selected ? (
            <span className="truncate text-xs text-text-muted">{subtitle}</span>
          ) : (
            <span className="flex min-w-0 items-center gap-3 overflow-hidden">
              {stats.map((stat) => (
                <Stat key={stat.icon} size="sm" {...stat} />
              ))}
            </span>
          )}
        </span>
      </button>
      {selected && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <div className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {stats.map((stat) => (
                <Stat key={stat.icon} {...stat} />
              ))}
            </span>
            {surface && <SurfaceBar caption shares={surface} />}
          </div>
          {chart}
          {days.length > 0 && <DayList days={days} onHoverDay={onHoverDay} />}
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
