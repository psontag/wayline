import {
  addDays,
  addHours,
  localTimeToDate,
  ridingHours,
  stageStartTime,
  timeToHours,
  type Trip,
} from "@wayline/domain";
import { useFormat, WeatherTimeline } from "@wayline/ui";
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

/** Weather of a stage by hour, or why there is none yet. */
export function StageWeather({
  trip,
  index,
  onRideStartChange,
  time,
  onTimeChange,
}: {
  trip: Trip;
  index: number;
  /** Moves the ride window. Without it, the window is fixed. */
  onRideStartChange?: (start: string) => void;
  /** Hour the map shows. Without it, there is no time marker. */
  time?: number;
  onTimeChange?: (time: number) => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const weather = useWeather(trip, index);
  const date = trip.startDate && addDays(trip.startDate, index);
  if (weather.data) {
    return (
      <DayTimeline
        forecast={weather.data}
        trip={trip}
        index={index}
        startTime={stageStartTime(trip.settings, index)}
        onRideStartChange={onRideStartChange}
        time={time}
        onTimeChange={onTimeChange}
      />
    );
  }
  return (
    <p className="text-sm text-text-muted">
      {!date
        ? t("profile.noStartDate")
        : weather.isPending
          ? t("profile.loadingWeather")
          : t("profile.forecastFrom", {
              date: format.date(localTimeToDate(forecastFrom(date))),
            })}
    </p>
  );
}

/** Weather by hour with the ride window and the best start. */
function DayTimeline({
  forecast,
  trip,
  index,
  startTime,
  onRideStartChange,
  time,
  onTimeChange,
}: {
  forecast: StageForecast;
  trip: Trip;
  index: number;
  startTime: string;
  onRideStartChange?: (start: string) => void;
  time?: number;
  onTimeChange?: (time: number) => void;
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
      time={time}
      onTimeChange={onTimeChange}
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
