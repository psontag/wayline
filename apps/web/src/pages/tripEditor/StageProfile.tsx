import {
  addDays,
  addHours,
  expectedTimeAtKm,
  localTimeToDate,
  ridingHours,
  type RouteNetwork,
  routePoints,
  stageSpeed,
  stageStartTime,
  timeToHours,
  type Trip,
} from "@wayline/domain";
import {
  ElevationProfile,
  type ProfilePoint,
  SurfaceLegend,
  useFormat,
  WeatherTimeline,
} from "@wayline/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type StageForecast, useWeather } from "../../data/queries";
import {
  bestStartOf,
  describeRide,
  forecastFrom,
  hoursOf,
  rideFrom,
  TIMELINE_FROM,
  TIMELINE_TO,
  timelineHours,
} from "./stageWeather";
import { isChanged } from "./routeEdits";
import { profilePoints } from "./surfaceProfile";

export type StageProfileProps = {
  trip: Trip;
  index: number;
  network?: RouteNetwork;
  /** km of the crosshair. */
  hoverKm?: number;
  onHoverKm: (km: number | undefined) => void;
  /** panel: bar under the map. sheet: block in the phone sheet. */
  variant?: "panel" | "sheet";
  /** Moves the ride window. Without it, the window is fixed. */
  onRideStartChange?: (start: string) => void;
};

/** Elevation of a stage by surface, and the weather on one km axis. */
export function StageProfile({
  trip,
  index,
  network,
  hoverKm,
  onHoverKm,
  variant = "panel",
  onRideStartChange,
}: StageProfileProps) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stage = trip.stages[index];
  const legs = stage?.legs;
  const points = useMemo(
    () => (legs ? profilePoints(legs, network) : []),
    [legs, network],
  );
  const proposed = isChanged(trip, index) ? trip.proposed?.[index] : undefined;
  const compare = useMemo(
    () => (proposed ? routePoints(proposed.legs) : []),
    [proposed],
  );
  const weather = useWeather(trip, index);
  if (!stage) return null;

  const date = trip.startDate && addDays(trip.startDate, index);
  const highest = points.reduce<ProfilePoint | undefined>(
    (best, p) => (!best || p.ele > best.ele ? p : best),
    undefined,
  );
  const startTime = stageStartTime(trip.settings, index);
  const hovered =
    hoverKm === undefined
      ? undefined
      : (points.find((p) => p.km >= hoverKm) ?? points.at(-1));

  let readout: string;
  if (hovered && hoverKm !== undefined) {
    const values = {
      distance: format.distance(hoverKm * 1000),
      elevation: format.elevation(hovered.ele),
    };
    readout = date
      ? t("profile.atWithTime", {
          ...values,
          time: format.time(
            localTimeToDate(
              expectedTimeAtKm(
                date,
                startTime,
                stageSpeed(stage.stats, trip.settings.avgSpeed),
                hoverKm,
              ),
            ),
          ),
        })
      : t("profile.at", values);
  } else {
    const values = {
      distance: format.distance(stage.stats.distance),
      ascent: format.elevation(stage.stats.ascent),
    };
    readout = t("profile.totalsWithRiding", {
      ...values,
      duration: format.duration(
        ridingHours(stage.stats, trip.settings.avgSpeed),
      ),
    });
  }

  return (
    <section
      className={
        variant === "panel"
          ? "flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-4 py-3"
          : "flex flex-col gap-2"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-3">
          {variant === "panel" ? (
            <h2 className="truncate font-bold">
              {t("profile.title", {
                day: index + 1,
                from: stage.start.name,
                to: stage.end.name,
              })}
            </h2>
          ) : (
            <h2 className="text-sm font-bold">{t("phone.elevation")}</h2>
          )}
          <span className="text-xs whitespace-nowrap text-text-muted tabular-nums">
            {readout}
          </span>
        </div>
        {variant === "panel" && <SurfaceLegend />}
      </div>
      <div
        className={
          variant === "panel"
            ? "grid gap-x-8 gap-y-3 lg:grid-cols-2"
            : "flex flex-col gap-3"
        }
      >
        <ElevationProfile
          axes
          points={points}
          compare={compare}
          hoverKm={hoverKm}
          onHoverKm={onHoverKm}
          aria-label={t("profile.label", {
            day: index + 1,
            elevation: format.elevation(highest?.ele ?? 0),
            distance: format.distance((highest?.km ?? 0) * 1000),
          })}
        />
        <div className="min-w-0 max-lg:border-t max-lg:border-border max-lg:pt-2">
          {weather.data ? (
            <DayTimeline
              forecast={weather.data}
              trip={trip}
              index={index}
              startTime={startTime}
              onRideStartChange={onRideStartChange}
            />
          ) : (
            <p className="text-sm text-text-muted">
              {!date
                ? t("profile.noStartDate")
                : weather.isPending
                  ? t("profile.loadingWeather")
                  : t("profile.forecastFrom", {
                      date: format.date(localTimeToDate(forecastFrom(date))),
                    })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Weather by hour with the ride window and the best start. */
function DayTimeline({
  forecast,
  trip,
  index,
  startTime,
  onRideStartChange,
}: {
  forecast: StageForecast;
  trip: Trip;
  index: number;
  startTime: string;
  onRideStartChange?: (start: string) => void;
}) {
  const { t } = useTranslation("tripEditor");
  const stats = trip.stages[index]?.stats;
  const { avgSpeed } = trip.settings;
  const hours = useMemo(() => timelineHours(forecast), [forecast]);
  const best = useMemo(
    () => stats && bestStartOf(forecast, stats, avgSpeed, startTime),
    [forecast, stats, avgSpeed, startTime],
  );
  if (!stats) return null;
  const clock = (h: number) => addHours("00:00", h);
  const { daylight } = forecast;

  return (
    <WeatherTimeline
      hours={hours}
      from={TIMELINE_FROM}
      to={TIMELINE_TO}
      sunrise={daylight && hoursOf(daylight.sunrise)}
      sunset={daylight && hoursOf(daylight.sunset)}
      start={timeToHours(startTime)}
      duration={ridingHours(stats, avgSpeed)}
      onStartChange={onRideStartChange && ((h) => onRideStartChange(clock(h)))}
      describe={(h) => {
        const ride = rideFrom(forecast, clock(h));
        return ride ? describeRide(t, ride) : undefined;
      }}
      best={
        best && {
          start: timeToHours(best.start),
          reason: t("timeline.reason", {
            rain: t(`timeline.rainKind.${best.rain}`),
            wind: t(`timeline.mostly.${best.wind}`),
          }),
        }
      }
    />
  );
}
