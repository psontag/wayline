import {
  addDays,
  bearing,
  localTimeToDate,
  relativeWind,
  type StageWeather,
  type WeatherSample,
} from "@wayline/domain";
import type { WeatherCondition, WeatherStripItem, Wind } from "@wayline/ui";

/** Days the weather provider looks ahead. */
export const FORECAST_DAYS = 16;

/** First day a forecast covers the given date. */
export function forecastFrom(date: string): string {
  return addDays(date, -(FORECAST_DAYS - 1));
}

function condition(sample: WeatherSample): WeatherCondition {
  if (sample.precipitation >= 0.1) return "rain";
  if (sample.precipitationProbability >= 0.4) return "cloud";
  return "sun";
}

/** About `count` evenly spread points for the weather strip. */
export function stripItems(
  weather: StageWeather,
  count = 7,
): WeatherStripItem[] {
  const { points } = weather;
  const n = Math.min(count, points.length);
  const picks = Array.from({ length: n }, (_, i) =>
    Math.round((i * (points.length - 1)) / Math.max(1, n - 1)),
  );
  return picks.flatMap((i) => {
    const p = points[i];
    // Direction of travel: towards the next point, or from the one before.
    const j = i === points.length - 1 ? i - 1 : i;
    const a = points[j];
    const b = points[j + 1];
    if (!p || !a || !b) return [];
    const travel = bearing(a.coord, b.coord);
    const from = p.sample.windDirection;
    return [
      {
        distance: p.km * 1000,
        time: localTimeToDate(p.time),
        temperature: p.sample.temperature,
        condition: condition(p.sample),
        wind: {
          kind: relativeWind(travel, from),
          // The wind blows to from + 180°. 0 means it pushes from behind.
          rotation: (((from + 180 - travel) % 360) + 360) % 360,
        },
      },
    ];
  });
}

/** Main wind of a stage for the stage card. */
export function stageWind(weather: StageWeather): Wind {
  const { wind } = weather;
  return {
    kind: wind.dominant,
    share: wind[wind.dominant],
    speedKmh: wind.avgSpeed,
  };
}
