import {
  addDays,
  type Climb,
  expectedTimeAtKm,
  localTimeToDate,
  ridingHours,
  type RouteNetwork,
  routePoints,
  stageSpeed,
  stageStartTime,
  type Trip,
} from "@wayline/domain";
import {
  ElevationProfile,
  type ProfilePoint,
  SurfaceLegend,
  useFormat,
} from "@wayline/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StageWeather } from "./DayWeatherTimeline";
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
  /** Climbs of the stage, and the one to show stronger. */
  climbs?: Climb[];
  highlightedClimb?: number;
};

/** Elevation of a stage by surface. The phone sheet adds the weather. */
export function StageProfile({
  trip,
  index,
  network,
  hoverKm,
  onHoverKm,
  variant = "panel",
  onRideStartChange,
  climbs,
  highlightedClimb,
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
          variant === "panel" ? "flex flex-col" : "flex flex-col gap-3"
        }
      >
        <ElevationProfile
          axes
          climbs={climbs}
          highlightedClimb={highlightedClimb}
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
        {variant === "sheet" && (
          <StageWeather
            trip={trip}
            index={index}
            onRideStartChange={onRideStartChange}
          />
        )}
      </div>
    </section>
  );
}
