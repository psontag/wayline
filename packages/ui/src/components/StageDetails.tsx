import * as Toggle from "@radix-ui/react-toggle";
import { Lock, LockOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { Stat } from "./Stat";
import { SurfaceBar, type SurfaceShares } from "./SurfaceBar";

export type Wind = {
  kind: "head" | "tail" | "cross";
  /** Share of the distance with this wind, 0 to 1. */
  share: number;
  speedKmh: number;
};

export type DayWeatherProps = {
  temperature: { min: number; max: number };
  /** Lowest feels-like temperature on the ride. */
  feelsLike?: number;
  /** mm, highest hourly value on the ride. */
  rain: number;
  wind?: Wind;
  className?: string;
};

/** Temperature, rain and wind of a day as icon stats. */
export function DayWeather({
  temperature,
  feelsLike,
  rain,
  wind,
  className,
}: DayWeatherProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const range = t("stage.temperatureRange", {
    min: Math.round(temperature.min),
    max: format.temperature(temperature.max),
  });

  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      <Stat
        size="sm"
        icon="temperature"
        label={t("stage.temperature")}
        value={
          feelsLike === undefined
            ? range
            : t("stage.feelsLike", {
                range,
                feelsLike: format.temperature(feelsLike),
              })
        }
      />
      <Stat
        size="sm"
        icon={rain >= 0.1 ? "rain" : "dry"}
        label={t("stage.rain")}
        value={
          rain >= 0.1
            ? t("stage.rainUpTo", { amount: format.rain(rain) })
            : t("stage.dry")
        }
      />
      {wind && (
        <Stat
          size="sm"
          icon="wind"
          label={t("stage.windLabel")}
          value={t("stage.windWithSpeed", {
            wind: t(`stage.wind.${wind.kind}`, {
              share: format.percent(wind.share),
            }),
            speed: format.speed(wind.speedKmh),
          })}
        />
      )}
    </div>
  );
}

export type StageDetailsProps = {
  surface: SurfaceShares;
  /** Missing without a forecast. */
  weather?: DayWeatherProps;
  /** Climbs of the day, e.g. a ClimbList. */
  climbs?: ReactNode;
  /** Weather by hour, below the weather summary. */
  forecast?: ReactNode;
  locked: boolean;
  /** Without it, the lock is only shown, not a button. */
  onLockedChange?: (locked: boolean) => void;
  /** Other stops to pick from. */
  alternatives?: ReactNode;
  /** Note at the top, e.g. that the route differs from the proposal. */
  change?: ReactNode;
  /** Hotel and booking link, in their own section. */
  sleep?: ReactNode;
  /** More content at the end. */
  children?: ReactNode;
};

/** Details of the selected day: surface, weather, stop and hotel. */
export function StageDetails({
  surface,
  weather,
  climbs,
  forecast,
  locked,
  onLockedChange,
  alternatives,
  change,
  sleep,
  children,
}: StageDetailsProps) {
  const { t } = useTranslation("ui");
  const showStop = alternatives || onLockedChange || locked;

  return (
    <div className="flex flex-col">
      {change && <div className="pb-3">{change}</div>}
      <Section title={t("stage.route")}>
        <SurfaceBar shares={surface} caption />
        {climbs}
      </Section>
      {(weather || forecast) && (
        <Section title={t("stage.weather")}>
          {weather && <DayWeather {...weather} />}
          {forecast}
        </Section>
      )}
      {showStop && (
        <Section
          title={t("stage.whereToStop")}
          action={
            onLockedChange ? (
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
            )
          }
        >
          {alternatives}
        </Section>
      )}
      {sleep && <Section title={t("stage.whereToSleep")}>{sleep}</Section>}
      {children}
    </div>
  );
}

/** One part of the day details, with a small title and a rule above. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
