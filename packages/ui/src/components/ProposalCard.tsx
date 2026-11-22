import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import type { StatIcon } from "../icons";
import { Badge } from "./Chip";
import { DayList, type DayListItem } from "./DayList";
import { type RouteColor, routeColorClasses } from "./RouteLabel";
import { Stat } from "./Stat";
import { SurfaceBar, type SurfaceShares } from "./SurfaceBar";
import { Tooltip } from "./Tooltip";

export type ProposalStat = { icon: StatIcon; value: string; label: string };

export type ProposalDay = DayListItem;

export type ProposalTag = { label: string; hint: string };

/** One day of a proposal against what it should be, in km. */
export type ProposalDayKm = { km: number; target: number };

export type ProposalCardProps = {
  /** Same letter as on the map. Stops have numbers. */
  letter: string;
  title: string;
  /** Small line under the title, e.g. "Via Haßfurt and Schweinfurt". */
  subtitle?: string;
  /** Route color of the number, as on the map. */
  color?: RouteColor;
  /** Short badges, most useful first, e.g. "Flattest". The hint shows on hover. */
  tags?: ProposalTag[];
  /** Three stats. A compact card shows them in one line. */
  stats: ProposalStat[];
  /** Shown as a surface bar under the stats when selected. */
  surface?: SurfaceShares;
  /** A small bar per day, so an over-long day shows at a glance. */
  dayKm?: ProposalDayKm[];
  /** Says what the day bars show, for screen readers. */
  dayKmLabel?: string;
  /** Shown when selected. One row per day. */
  days?: ProposalDay[];
  selected?: boolean;
  onSelect?: () => void;
  /** Called with true when the pointer enters, false when it leaves. */
  onHover?: (hover: boolean) => void;
  /** Called with the day number (from 1) under the pointer, or undefined. */
  onHoverDay?: (day: number | undefined) => void;
  /** Shown at the bottom when selected, e.g. actions. */
  children?: ReactNode;
};

/** Tags before "+n". */
const SHOWN_TAGS = 3;

/** One generated trip in the proposals list. Only the selected one is open. */
export function ProposalCard({
  letter,
  title,
  subtitle,
  color,
  tags = [],
  stats,
  surface,
  dayKm = [],
  dayKmLabel,
  days = [],
  selected = false,
  onSelect,
  onHover,
  onHoverDay,
  children,
}: ProposalCardProps) {
  const { t } = useTranslation("ui");
  return (
    <article
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        "flex flex-col rounded-md border transition-colors",
        selected
          ? "border-selected-border bg-surface ring-1 ring-selected-border"
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
        <LetterBadge letter={letter} color={color} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-md font-bold">
              {title}
            </span>
            {dayKm.length > 1 && <DayKmBars days={dayKm} label={dayKmLabel} />}
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
          {tags.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {tags.slice(0, SHOWN_TAGS).map(({ label, hint }) => (
                <Tooltip key={label} label={hint}>
                  <span>
                    <Badge>{label}</Badge>
                  </span>
                </Tooltip>
              ))}
              {tags.length > SHOWN_TAGS && (
                <Tooltip
                  label={tags
                    .slice(SHOWN_TAGS)
                    .map((tag) => tag.label)
                    .join(" · ")}
                >
                  <span>
                    <Badge>
                      {t("proposalCard.moreTags", {
                        count: tags.length - SHOWN_TAGS,
                      })}
                    </Badge>
                  </span>
                </Tooltip>
              )}
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
          {days.length > 0 && <DayList days={days} onHoverDay={onHoverDay} />}
          {children}
        </div>
      )}
    </article>
  );
}

// Square, so it doesn't look like the round stop markers.
function LetterBadge({
  letter,
  color,
}: {
  letter: string;
  color?: RouteColor;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-sm font-extrabold",
        color
          ? [routeColorClasses[color], "text-on-route"]
          : "bg-hover text-text",
      )}
    >
      {letter}
    </span>
  );
}

/** A day this far off its target km is marked. */
const DAY_OFF = 0.25;

/** One bar per day, scaled to the longest day or target. */
function DayKmBars({
  days,
  label,
}: {
  days: ProposalDayKm[];
  label: string | undefined;
}) {
  const max = Math.max(...days.flatMap((d) => [d.km, d.target]));
  return (
    <span
      role="img"
      aria-label={label}
      className="flex h-5 shrink-0 items-end gap-0.5"
    >
      {days.map((d, i) => (
        <span
          key={i}
          style={{ height: `${Math.max(15, (d.km / max) * 100)}%` }}
          className={cn(
            "w-1.5 rounded-t-sm",
            Math.abs(d.km - d.target) / d.target > DAY_OFF
              ? "bg-warning"
              : "bg-text-muted",
          )}
        />
      ))}
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
