import {
  addDays,
  bearing,
  bestStart,
  CALM_KMH,
  hourlyAlongStage,
  RAIN_MM,
  relativeWind,
  rideSummary,
  rideWarnings,
  type Settings,
  type Span,
  stageStartTime,
  type StageWeather,
  timeToHours,
  type Trip,
  weatherAlongStage,
  type WindKind,
  windRotation,
} from "@wayline/domain";
import type {
  Format,
  RouteWeatherPoint,
  TimelineHour,
  Wind,
} from "@wayline/ui";
import type { TFunction } from "i18next";
import type { StageForecast } from "../../data/queries";

/** Days the weather provider looks ahead. */
export const FORECAST_DAYS = 16;

/** Hours the weather timeline shows. */
export const TIMELINE_FROM = 7;
export const TIMELINE_TO = 19;

/** First day a forecast covers the given date. */
export function forecastFrom(date: string): string {
  return addDays(date, -(FORECAST_DAYS - 1));
}

/** Main wind of a stage for the stage card. */
export function stageWind(weather: StageWeather): Wind {
  const { wind } = weather;
  return {
    kind: wind.avgSpeed < CALM_KMH ? "calm" : wind.dominant,
    share: wind[wind.dominant],
    speedKmh: wind.avgSpeed,
  };
}

export function timelineHours(f: StageForecast): TimelineHour[] {
  const hours = Array.from(
    { length: TIMELINE_TO - TIMELINE_FROM },
    (_, i) => TIMELINE_FROM + i,
  );
  return hourlyAlongStage(f.route, f.date, f.forecastAt, hours).map((h) => ({
    hour: Number(h.time.slice(11, 13)),
    rain: h.precipitation,
    rainChance: h.precipitationProbability,
    feelsLike: h.apparentTemperature,
    wind: {
      kind: h.wind,
      rotation: h.rotation,
      speed: h.windSpeed,
      gusts: h.windGusts,
    },
  }));
}

/** The stage ridden from another start time, with the same forecasts. */
export function rideFrom(f: StageForecast, start: string) {
  return weatherAlongStage(
    f.route,
    { date: f.date, startTime: start, avgSpeed: f.speed },
    f.forecastAt,
  );
}

export function bestStartOf(
  f: StageForecast,
  stats: { distance: number; ascent: number },
  avgSpeed: number,
  preferred: string,
) {
  return bestStart((start) => rideFrom(f, start), {
    stats,
    avgSpeed,
    preferred,
    daylight: f.daylight,
  });
}

/** Hours as a decimal from a local time "YYYY-MM-DDTHH:MM". */
export function hoursOf(time: string): number {
  return timeToHours(time.slice(11));
}

type T = TFunction<"tripEditor">;

function spanText(t: T, what: "rain" | "headwind", span: Span): string {
  switch (span.kind) {
    case "none":
      return t(`timeline.${what}.none`);
    case "all":
      return t(`timeline.${what}.all`);
    case "until":
      return t(`timeline.${what}.until`, { time: span.time });
    case "from":
      return t(`timeline.${what}.from`, { time: span.time });
    case "between":
      return t(`timeline.${what}.between`, { from: span.from, to: span.to });
  }
}

/** "Rain until 09:00 · headwind after 15:00" */
export function describeRide(t: T, weather: StageWeather): string {
  const summary = rideSummary(weather);
  return t("timeline.summary", {
    rain: spanText(t, "rain", summary.rain),
    wind:
      summary.headwind.kind === "none"
        ? t(`timeline.mostly.${summary.wind}`)
        : spanText(t, "headwind", summary.headwind),
  });
}

/** Cold start and late arrival of a day, as warning texts. */
export function dayWarnings(
  t: T,
  format: Format,
  trip: Trip,
  index: number,
  weather: StageForecast,
): string[] {
  const stage = trip.stages[index];
  if (!stage) return [];
  const { cold, dark } = rideWarnings(
    weather,
    {
      start: stageStartTime(trip.settings, index),
      stats: stage.stats,
      avgSpeed: trip.settings.avgSpeed,
    },
    weather.daylight,
  );
  return [
    ...(cold === undefined
      ? []
      : [t("warning.cold", { temperature: format.temperature(cold) })]),
    ...(dark ? [t("warning.dark", dark)] : []),
  ];
}

/** Settings with the ride start of one stage set. */
export function withRideStart(
  settings: Settings,
  index: number,
  start: string,
  stageCount: number,
): Settings {
  const rideStarts = Array.from(
    { length: stageCount },
    (_, i) => settings.rideStarts?.[i] ?? null,
  );
  rideStarts[index] = start;
  return { ...settings, rideStarts };
}

export type TripWeatherPoint = RouteWeatherPoint & {
  /** Expected local time "YYYY-MM-DDTHH:MM". */
  time: string;
};

/** The weather of every day along the trip km, for the trip chart. */
export function tripWeatherPoints(days: StageWeather[]): TripWeatherPoint[] {
  const out: TripWeatherPoint[] = [];
  let offset = 0;
  days.forEach((weather, day) => {
    const { points } = weather;
    points.forEach((p, i) => {
      // The way ahead, or the last stretch at the end of the day.
      const a = points[i === points.length - 1 ? i - 1 : i];
      const b = points[i === points.length - 1 ? i : i + 1];
      const way = a && b ? bearing(a.coord, b.coord) : 0;
      const { sample } = p;
      out.push({
        km: offset + p.km,
        day,
        time: p.time,
        rain: sample.precipitation,
        rainChance: sample.precipitationProbability,
        feelsLike: sample.apparentTemperature,
        wind: {
          kind: relativeWind(way, sample.windDirection),
          rotation: windRotation(way, sample.windDirection),
          speed: sample.windSpeed,
          gusts: sample.windGusts,
        },
      });
    });
    offset += points.at(-1)?.km ?? 0;
  });
  return out;
}

/** Days with rain (1-based) and the main wind over the whole trip. */
export function tripSummary(days: StageWeather[]): {
  rainDays: number[];
  wind: WindKind;
} {
  const rainDays = days.flatMap((d, i) =>
    d.maxPrecipitation >= RAIN_MM ? [i + 1] : [],
  );
  const sum = { head: 0, tail: 0, cross: 0 };
  for (const d of days) {
    const km = d.points.at(-1)?.km ?? 0;
    for (const kind of WIND_KINDS) sum[kind] += d.wind[kind] * km;
  }
  const wind = WIND_KINDS.reduce((a, b) => (sum[b] > sum[a] ? b : a));
  return { rainDays, wind };
}

const WIND_KINDS: WindKind[] = ["tail", "cross", "head"];
