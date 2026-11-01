import { ChevronRight, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { Badge } from "./Chip";
import { type DayColor, dayColorClasses } from "./DayList";
import { Stat } from "./Stat";

export type DayCardProps = {
  /** "1" */
  label: string;
  /** "Sun 8 Nov" */
  date?: string;
  /** Where the day ends. */
  place: string;
  color: DayColor;
  /** "65 km" */
  distance: string;
  ascent?: string;
  ridingTime?: string;
  /** E.g. a DayWeather, below the stats. */
  weather?: ReactNode;
  /** Hotel at the stop. */
  hotel?: string;
  locked?: boolean;
  changed?: boolean;
  /** Highlighted, e.g. while its route is hovered on the map. */
  highlighted?: boolean;
  onClick: () => void;
  onHoverChange?: (hovered: boolean) => void;
};

/** One day of a trip in the trip panel. Opens the day. */
export function DayCard({
  label,
  date,
  place,
  color,
  distance,
  ascent,
  ridingTime,
  weather,
  hotel,
  locked,
  changed,
  highlighted,
  onClick,
  onHoverChange,
}: DayCardProps) {
  const { t } = useTranslation("ui");
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => onHoverChange?.(true)}
      onPointerLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-md border text-left transition-colors",
        highlighted
          ? "border-selected-border bg-selected"
          : "border-border bg-surface hover:bg-hover",
        focusRing,
      )}
    >
      <span className={cn("w-1 shrink-0", dayColorClasses[color])} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-col gap-1.5 px-3 py-2.5">
          <span className="flex items-center gap-2 text-2xs font-semibold text-text-muted">
            {date
              ? t("dayCard.dayDate", { day: label, date })
              : t("dayCard.day", { day: label })}
            {locked && (
              <Badge>
                <Lock className="mr-1 size-2.5" aria-hidden />
                {t("stage.locked")}
              </Badge>
            )}
            {changed && <Badge tone="accent">{t("dayCard.changed")}</Badge>}
          </span>
          <span className="truncate text-md font-extrabold">{place}</span>
          <span className="flex flex-wrap gap-x-3.5 gap-y-1">
            <Stat
              size="sm"
              icon="distance"
              value={distance}
              label={t("dayList.distance")}
            />
            {ascent && (
              <Stat
                size="sm"
                icon="ascent"
                value={ascent}
                label={t("dayList.ascent")}
              />
            )}
            {ridingTime && (
              <Stat
                size="sm"
                icon="ridingTime"
                value={ridingTime}
                label={t("dayList.ridingTime")}
              />
            )}
          </span>
        </span>
        {(weather || hotel) && (
          <span className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
            {weather}
            {hotel && (
              <Stat
                size="sm"
                icon="beds"
                value={hotel}
                label={t("dayCard.hotel")}
                className="min-w-0"
              />
            )}
          </span>
        )}
      </span>
      <ChevronRight
        className="mr-2.5 ml-1 size-4 shrink-0 self-center text-text-muted"
        aria-hidden
      />
    </button>
  );
}
