import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type StatIcon, statIcons } from "../icons";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { Badge } from "./Chip";
import { type RouteColor, routeColorClasses } from "./RouteLabel";
import { Tooltip } from "./Tooltip";

export type DayColor = RouteColor | "stage-a" | "stage-b";

export type DayListItem = {
  /** "1" */
  label: string;
  /** Where the day ends, e.g. "Bergrheinfeld". */
  place: string;
  /** "65 km" */
  distance: string;
  /** "380 m" */
  ascent?: string;
  /** Short note, e.g. "Half day". */
  tag?: string;
  /** Fill of the day badge. Defaults to the stop marker color. */
  color?: DayColor;
};

export type DayListProps = {
  days: DayListItem[];
  /** Called with the day number (from 1) under the pointer, or undefined. */
  onHoverDay?: (day: number | undefined) => void;
  /** Day number (from 1). */
  selectedDay?: number;
  /** Makes the rows buttons. */
  onSelectDay?: (day: number) => void;
  className?: string;
};

const colorClasses: Record<DayColor, string> = {
  ...routeColorClasses,
  "stage-a": "bg-stage-a",
  "stage-b": "bg-stage-b",
};

/** Days of a trip as a timeline of numbered stops, with km and ascent columns. */
export function DayList({
  days,
  onHoverDay,
  selectedDay,
  onSelectDay,
  className,
}: DayListProps) {
  const { t } = useTranslation("ui");
  const hasAscent = days.some((day) => day.ascent);

  return (
    <div className={cn("flex flex-col text-sm", className)}>
      <div className="flex items-center gap-2 px-1.5 pb-1">
        <span className="flex-1" />
        <ColumnIcon icon="distance" label={t("dayList.distance")} />
        {hasAscent && <ColumnIcon icon="ascent" label={t("dayList.ascent")} />}
      </div>
      <ol className="flex flex-col">
        {days.map((day, i) => {
          const n = i + 1;
          const selected = n === selectedDay;
          const content = (
            <>
              <span className="flex w-6 shrink-0 flex-col items-center">
                <Line hidden={i === 0} />
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums",
                    day.color
                      ? [colorClasses[day.color], "text-on-route"]
                      : selected
                        ? "bg-route-selected text-on-route"
                        : "bg-marker text-surface",
                    selected && "ring-2 ring-route-outline",
                  )}
                >
                  {day.label}
                </span>
                <Line hidden={i === days.length - 1} />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 py-2.5">
                <span className="min-w-0 truncate font-bold">{day.place}</span>
                {day.tag && <Badge className="shrink-0">{day.tag}</Badge>}
              </span>
              <span className="w-14 shrink-0 self-center text-right font-semibold tabular-nums">
                {day.distance}
              </span>
              {hasAscent && (
                <span className="w-12 shrink-0 self-center text-right text-text-muted tabular-nums">
                  {day.ascent}
                </span>
              )}
            </>
          );
          return (
            <li
              key={day.label}
              onMouseEnter={() => onHoverDay?.(n)}
              onMouseLeave={() => onHoverDay?.(undefined)}
            >
              <Row
                selected={selected}
                onSelect={onSelectDay && (() => onSelectDay(n))}
              >
                {content}
              </Row>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Row({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const className = cn(
    "flex w-full items-stretch gap-2 rounded-sm px-1.5 text-left text-text transition-colors",
    selected ? "bg-selected" : "hover:bg-hover",
  );
  return onSelect ? (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(className, focusRing)}
    >
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );
}

function Line({ hidden }: { hidden: boolean }) {
  return <span className={cn("w-0.5 flex-1", !hidden && "bg-route-dimmed")} />;
}

function ColumnIcon({ icon, label }: { icon: StatIcon; label: string }) {
  const Icon = statIcons[icon];
  return (
    <Tooltip label={label}>
      <span
        className={cn(
          "flex shrink-0 justify-end text-text-muted",
          icon === "distance" ? "w-14" : "w-12",
        )}
      >
        <Icon role="img" aria-label={label} className="size-3.5" />
      </span>
    </Tooltip>
  );
}
