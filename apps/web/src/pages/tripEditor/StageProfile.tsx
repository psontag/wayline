import {
  addDays,
  expectedTimeAtKm,
  localTimeToDate,
  type RouteNetwork,
  routePoints,
  stageStartTime,
  type Trip,
} from "@wayline/domain";
import {
  ElevationProfile,
  type ProfilePoint,
  SurfaceLegend,
  useFormat,
  WeatherStrip,
} from "@wayline/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWeather } from "../../data/queries";
import { stageTimes } from "./StageList";
import { forecastFrom, stripItems } from "./stageWeather";
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
};

/** Elevation of a stage by surface, and the weather on one km axis. */
export function StageProfile({
  trip,
  index,
  network,
  hoverKm,
  onHoverKm,
  variant = "panel",
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
  const times = stageTimes(trip, index);
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
                stageStartTime(trip.settings, index),
                trip.settings.avgSpeed,
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
    readout = times
      ? t("profile.totalsWithTimes", {
          ...values,
          start: format.time(times.start),
          end: format.time(times.end),
        })
      : t("profile.totals", values);
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
      <ElevationProfile
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
      <div className="min-h-12 border-t border-border pt-2">
        {weather.data ? (
          <WeatherStrip items={stripItems(weather.data)} />
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
    </section>
  );
}
