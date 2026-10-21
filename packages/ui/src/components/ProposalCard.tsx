import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type ProposalStat = { value: string; label: string };

export type ProposalDay = {
  /** "Day 1" or "Day 1 · Sat 12 Jun" */
  label: string;
  /** "Bamberg → Lichtenfels" */
  route: string;
  /** "38 km · 310 m" */
  stats: string;
  /** Distance in m, for the bar. */
  distance: number;
  /** Short note, e.g. "Half day". */
  tag?: string;
};

/** Day colors, alternating as on the map. */
export const dayColors = ["bg-route-selected", "bg-stage-b"] as const;

export type ProposalCardProps = {
  /** Same number as on the map. */
  number: number;
  title: string;
  subtitle: string;
  /** Four stats in one row. */
  stats: ProposalStat[];
  /** Elevation in m along the trip, evenly spaced. Drawn as a sparkline. */
  profile: number[];
  /** Short line at the bottom, e.g. the stops. */
  footer: string;
  /** Days, each with its route. Shown as a bar and one row per day. */
  days?: ProposalDay[];
  selected?: boolean;
  onSelect?: () => void;
  /** Called with true when the pointer enters, false when it leaves. */
  onHover?: (hover: boolean) => void;
  /** Shown below the card when it is selected, e.g. stages and actions. */
  children?: ReactNode;
};

/** One generated trip in the proposals list. */
export function ProposalCard({
  number,
  title,
  subtitle,
  stats,
  profile,
  footer,
  days = [],
  selected = false,
  onSelect,
  onHover,
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
          : "border-border bg-surface hover:border-text-muted",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex flex-col gap-2.5 rounded-md p-3 text-left text-text",
          focusRing,
        )}
      >
        <span className="flex items-center gap-2.5">
          <NumberBadge number={number} selected={selected} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-md font-bold">{title}</span>
            <span className="truncate text-xs text-text-muted">{subtitle}</span>
          </span>
        </span>
        <span className="grid grid-cols-4 gap-1.5 tabular-nums">
          {stats.map((stat) => (
            <span key={stat.label} className="flex min-w-0 flex-col">
              <span className="font-bold whitespace-nowrap">{stat.value}</span>
              <span className="truncate text-2xs text-text-muted">
                {stat.label}
              </span>
            </span>
          ))}
        </span>
        <Sparkline values={profile} />
        {days.length > 1 && <DayBar days={days} />}
        {days.length > 0 && (
          <span className="flex flex-col gap-1.5">
            {days.map((day, i) => (
              <span key={i} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    dayColors[i % 2],
                  )}
                />
                <span className="w-12 shrink-0 text-xs text-text-muted">
                  {day.label}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {day.route}
                </span>
                {day.tag && (
                  <span className="shrink-0 rounded-full bg-hover px-1.5 py-0.5 text-2xs font-bold">
                    {day.tag}
                  </span>
                )}
                <span className="shrink-0 text-text-muted tabular-nums">
                  {day.stats}
                </span>
              </span>
            ))}
          </span>
        )}
        <span className="text-xs text-text-muted">{footer}</span>
      </button>
      {selected && children && (
        <div className="flex flex-col gap-3 px-3 pb-3">{children}</div>
      )}
    </article>
  );
}

function DayBar({ days }: { days: ProposalDay[] }) {
  return (
    <span aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full">
      {days.map((day, i) => (
        <span
          key={i}
          className={dayColors[i % 2]}
          style={{ flexGrow: Math.max(1, day.distance) }}
        />
      ))}
    </span>
  );
}

function NumberBadge({
  number,
  selected,
}: {
  number: number;
  selected: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums",
        selected ? "bg-accent text-on-accent" : "bg-hover text-text",
      )}
    >
      {number}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="h-7" />;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 400;
      const y = 26 - ((v - min) / range) * 24;
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 400 28"
      preserveAspectRatio="none"
      aria-hidden
      className="block h-7 w-full"
    >
      <path
        d={d}
        fill="none"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        className="stroke-text-muted"
      />
    </svg>
  );
}

/** Placeholder for a proposal that is still being searched. */
export function ProposalCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-2.5 rounded-md border border-dashed border-border p-3 motion-safe:animate-pulse"
    >
      <span className="flex items-center gap-2.5">
        <span className="size-7 rounded-full bg-hover" />
        <span className="h-3 w-1/2 rounded-sm bg-hover" />
      </span>
      <span className="h-2.5 w-4/5 rounded-sm bg-hover" />
      <span className="h-7 w-full rounded-sm bg-hover" />
    </div>
  );
}
