import {
  addDays,
  localTimeToDate,
  type StageWeather,
  type Trip,
} from "@wayline/domain";
import {
  ChartBody,
  ChartInfo,
  ChartPanel,
  ChartToolbar,
  TripWeatherProfile,
  useFormat,
} from "@wayline/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  forecastFrom,
  type TripWeatherPoint,
  tripSummary,
} from "./stageWeather";

/** Weather along the whole trip under the map, or why there is none yet. */
export function TripWeatherPanel({
  trip,
  days,
  points,
  loading,
  hoverKm,
  onHoverKm,
  actions,
  plain = false,
}: {
  trip: Trip;
  /** Weather of every day. Null beyond the forecast. */
  days: StageWeather[] | null | undefined;
  points: TripWeatherPoint[];
  loading: boolean;
  hoverKm?: number;
  onHoverKm: (km: number | undefined) => void;
  /** Controls at the end of the header, e.g. the panel switcher. */
  actions?: ReactNode;
  /** Without the panel frame and title, e.g. in the phone sheet. */
  plain?: boolean;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const first = trip.stages[0];
  const last = trip.stages.at(-1);
  if (!first || !last) return null;
  const title = t("profile.tripTitle", {
    from: first.start.name,
    to: last.end.name,
  });

  let body: ReactNode;
  if (days && points.length > 1) {
    const summary = tripSummary(days);
    body = (
      <TripWeatherProfile
        points={points}
        hoverKm={hoverKm}
        onHoverKm={onHoverKm}
        summary={t("timeline.summary", {
          rain:
            summary.rainDays.length === 0
              ? t("timeline.rain.none")
              : t("tripWeather.rainDays", {
                  count: summary.rainDays.length,
                  days: summary.rainDays.join(", "),
                }),
          wind: t(`timeline.mostly.${summary.wind}`),
        })}
        describe={(p) =>
          t("tripWeather.at", {
            day: p.day + 1,
            time: format.time(localTimeToDate(p.time)),
            distance: format.distance(p.km * 1000),
          })
        }
      />
    );
  } else {
    const end =
      trip.startDate && addDays(trip.startDate, trip.stages.length - 1);
    const message = !end
      ? t("profile.noStartDate")
      : loading
        ? t("profile.loadingWeather")
        : t("profile.forecastFrom", {
            date: format.date(localTimeToDate(forecastFrom(end))),
          });
    // Keep the ChartPanel rows, so switching views moves nothing.
    body = (
      <>
        <ChartToolbar />
        <ChartBody className="items-center justify-center text-sm text-text-muted">
          {message}
        </ChartBody>
        <ChartInfo />
      </>
    );
  }

  return (
    <ChartPanel title={plain ? undefined : title} tabs={actions} plain={plain}>
      {body}
    </ChartPanel>
  );
}
