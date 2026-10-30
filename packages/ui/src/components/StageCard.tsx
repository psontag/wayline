import * as Toggle from "@radix-ui/react-toggle";
import { ArrowUp, Clock, Lock, LockOpen, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { SurfaceBar, type SurfaceShares } from "./SurfaceBar";

export type Wind = {
  kind: "head" | "tail" | "cross";
  /** Share of the distance with this wind, 0 to 1. */
  share: number;
  speedKmh: number;
};

export type StageCardProps = {
  day: number;
  /** Missing when the trip has no start date. */
  date?: Date;
  from: string;
  to: string;
  /** Meters */
  distance: number;
  /** Meters */
  ascent: number;
  surface: SurfaceShares;
  temperature?: { min: number; max: number };
  /** Lowest feels-like temperature on the ride. */
  feelsLike?: number;
  wind?: Wind;
  /** Riding time in hours, without breaks. */
  ridingHours?: number;
  locked: boolean;
  /** Without it, the lock is only shown, not a button. */
  onLockedChange?: (locked: boolean) => void;
  selected?: boolean;
  onSelect?: () => void;
  /** Stages alternate between two map colors. */
  color?: "a" | "b";
  /** Other stops to pick from, shown under the stop when selected. */
  alternatives?: ReactNode;
  /** More content for the selected state, e.g. hotel and booking link. */
  children?: ReactNode;
};

const windRotation = {
  head: "rotate-180",
  tail: "",
  cross: "rotate-90",
} as const;

export function StageCard(props: StageCardProps) {
  const {
    day,
    date,
    from,
    to,
    distance,
    ascent,
    selected = false,
    onSelect,
    color = "a",
  } = props;
  const { t } = useTranslation("ui");
  const format = useFormat();

  const header = (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums text-on-accent",
          selected ? "bg-accent" : color === "a" ? "bg-stage-a" : "bg-stage-b",
        )}
      >
        {day}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-text-muted">
          {date
            ? t("stage.day", { day, date: format.date(date) })
            : t("stage.dayOnly", { day })}
        </span>
        <span className="truncate text-md font-bold">
          {t("stage.route", { from, to })}
        </span>
      </div>
      <div className="flex flex-col items-end tabular-nums">
        <span className="font-bold">{format.distance(distance)}</span>
        <span className="text-xs text-text-muted">
          {format.elevation(ascent)}
        </span>
      </div>
    </div>
  );

  if (!selected) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={false}
        className={cn(
          "flex w-full flex-col gap-2.5 rounded-md border border-border bg-surface p-3 text-left text-base text-text",
          "transition-colors hover:border-text-muted",
          focusRing,
        )}
      >
        {header}
        <CompactMeta {...props} />
      </button>
    );
  }

  return (
    <article
      aria-current="true"
      className="flex flex-col gap-2.5 rounded-md border border-selected-border bg-surface p-3 text-base text-text"
    >
      {header}
      <SelectedDetails {...props} />
    </article>
  );
}

function useWindText(wind: Wind | undefined, withSpeed: boolean) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  if (!wind) return null;
  const text = t(`stage.wind.${wind.kind}`, {
    share: format.percent(wind.share),
  });
  return withSpeed
    ? t("stage.windWithSpeed", {
        wind: text,
        speed: format.speed(wind.speedKmh),
      })
    : text;
}

function CompactMeta({ temperature, wind, to, locked }: StageCardProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const windText = useWindText(wind, false);
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
      <span className="flex items-center gap-3 tabular-nums">
        {temperature && <span>{format.temperature(temperature.max)}</span>}
        {windText && <span>{windText}</span>}
      </span>
      <span className="flex items-center gap-1">
        {to}
        {locked && (
          <Lock className="size-3" role="img" aria-label={t("stage.locked")} />
        )}
      </span>
    </div>
  );
}

function SelectedDetails({
  surface,
  temperature,
  feelsLike,
  wind,
  ridingHours,
  to,
  locked,
  onLockedChange,
  alternatives,
  children,
}: StageCardProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const windText = useWindText(wind, true);
  const range =
    temperature &&
    t("stage.temperatureRange", {
      min: Math.round(temperature.min),
      max: format.temperature(temperature.max),
    });

  return (
    <div className="flex flex-col gap-3">
      <SurfaceBar shares={surface} />
      {(temperature || wind || ridingHours !== undefined) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm tabular-nums">
          {ridingHours !== undefined && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {t("stage.riding", { duration: format.duration(ridingHours) })}
            </span>
          )}
          {temperature && (
            <span className="flex items-center gap-1.5">
              <Sun className="size-4" aria-hidden />
              {feelsLike === undefined
                ? range
                : t("stage.feelsLike", {
                    range,
                    feelsLike: format.temperature(feelsLike),
                  })}
            </span>
          )}
          {wind && (
            <span className="flex items-center gap-1.5">
              <ArrowUp
                className={cn("size-4", windRotation[wind.kind])}
                aria-hidden
              />
              {windText}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-md bg-bg p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <Trans
              t={t}
              i18nKey="stage.stop"
              values={{ name: to }}
              components={{ strong: <strong /> }}
            />
          </span>
          {onLockedChange ? (
            <Toggle.Root
              pressed={locked}
              onPressedChange={onLockedChange}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 text-xs font-bold transition-colors hover:bg-hover",
                "text-text-muted data-[state=on]:text-text",
                focusRing,
              )}
            >
              {locked ? (
                <Lock className="size-3.5" aria-hidden />
              ) : (
                <LockOpen className="size-3.5" aria-hidden />
              )}
              {locked ? t("stage.locked") : t("stage.lock")}
            </Toggle.Root>
          ) : (
            locked && (
              <span className="inline-flex h-7 items-center gap-1.5 text-xs font-bold">
                <Lock className="size-3.5" aria-hidden />
                {t("stage.locked")}
              </span>
            )
          )}
        </div>
        {alternatives && (
          <div className="flex flex-wrap gap-1.5">{alternatives}</div>
        )}
      </div>
      {children}
    </div>
  );
}
