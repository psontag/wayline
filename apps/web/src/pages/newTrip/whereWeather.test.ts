import type { LonLat, WeatherSample } from "@wayline/domain";
import type { Forecast } from "@wayline/providers";
import { describe, expect, it } from "vitest";
import { type Grid, gridOf } from "../../components/map/weatherGrid";
import {
  dayField,
  lineWind,
  pastForecast,
  rainOf,
  wetDays,
  whereWeather,
} from "./whereWeather";

const DAY1 = "2026-11-14";
const DAY2 = "2026-11-15";

function hours(date: string, values: Partial<WeatherSample>): WeatherSample[] {
  return Array.from({ length: 24 }, (_, h) => ({
    time: `${date}T${String(h).padStart(2, "0")}:00`,
    temperature: 10,
    precipitation: 0,
    precipitationProbability: 0,
    windSpeed: 20,
    windDirection: 0,
    apparentTemperature: 9,
    windGusts: 30,
    ...values,
  }));
}

const grid = gridOf([
  [8, 49],
  [9, 49],
]) as Grid;

/** Rain east of 8.5° on the first day. Wind from the north all the time. */
function forecasts(): Forecast[] {
  return grid.cells.map((cell: LonLat) => ({
    cell,
    samples: [
      ...hours(DAY1, { precipitation: cell[0] > 8.5 ? 0.5 : 0 }),
      ...hours(DAY2, {}),
    ],
    daylight: [],
  }));
}

describe("rainOf", () => {
  it("splits the day's rain into dry, showers and wet", () => {
    expect(rainOf(0.2)).toBe("dry");
    expect(rainOf(1)).toBe("showers");
    expect(rainOf(4)).toBe("wet");
  });
});

describe("pastForecast", () => {
  it("is true once the start is 16 days out", () => {
    expect(pastForecast("2026-11-01", "2026-11-16")).toBe(false);
    expect(pastForecast("2026-11-01", "2026-11-17")).toBe(true);
  });
});

describe("whereWeather", () => {
  const weather = whereWeather(grid, forecasts(), DAY1, 3);

  it("keeps the days with a forecast, riding hours only", () => {
    expect(weather.days.map((d) => d.date)).toEqual([DAY1, DAY2]);
    // 9 riding hours at 0.5 mm.
    expect(Math.max(...(weather.days[0]?.cells.map((c) => c.rain) ?? []))).toBe(
      4.5,
    );
  });

  it("finds the wet days at a place", () => {
    expect(wetDays(weather, [[8.9, 49]])).toEqual([DAY1]);
    expect(wetDays(weather, [[8.1, 49]])).toEqual([]);
  });

  it("makes a map field for one day", () => {
    const field = dayField(weather, DAY2);
    expect(field?.rain.every((r) => r === 0)).toBe(true);
    expect(field?.speed[0]).toBeCloseTo(20);
    expect(dayField(weather, "2026-12-01")).toBeUndefined();
  });

  it("knows tailwind from headwind along a line", () => {
    // Wind from the north: riding south is tailwind.
    const south = lineWind(weather, [
      [8.5, 49.3],
      [8.5, 48.8],
    ]);
    const north = lineWind(weather, [
      [8.5, 48.8],
      [8.5, 49.3],
    ]);
    expect(south.kind).toBe("tail");
    expect(north.kind).toBe("head");
    expect(south.effort).toBeLessThan(north.effort);
  });
});
