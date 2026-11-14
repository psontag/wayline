import {
  type Area,
  encodeLine,
  type LonLat,
  type WeatherSample,
} from "@wayline/domain";
import type { Forecast } from "@wayline/providers";
import { describe, expect, it } from "vitest";
import { type Grid, gridOf } from "../../components/map/weatherGrid";
import {
  areaCells,
  lineWind,
  pastForecast,
  rainDays,
  rainOf,
  tripWeather,
  wetDays,
  whereWeather,
  worstRain,
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
  const weather = whereWeather(grid, forecasts(), DAY1);

  it("keeps the days with a forecast, riding hours only", () => {
    expect(weather.days.map((d) => d.date)).toEqual([DAY1, DAY2]);
    // 9 riding hours at 0.5 mm.
    expect(Math.max(...(weather.days[0]?.cells.map((c) => c.rain) ?? []))).toBe(
      4.5,
    );
  });

  it("picks out the trip days", () => {
    const trip = tripWeather(weather, DAY2, 3);
    expect(trip.days.map((d) => d.date)).toEqual([DAY2]);
  });

  it("finds the wet days at a place", () => {
    expect(wetDays(weather, [[8.9, 49]])).toEqual([DAY1]);
    expect(wetDays(weather, [[8.1, 49]])).toEqual([]);
  });

  it("gives an area the worst cell inside it on each day", () => {
    const area = (outline: LonLat[]): Area => ({
      id: "a",
      name: "A",
      officialName: "A",
      label: outline[0] as LonLat,
      bbox: [8, 48.5, 9.5, 49.5],
      outline: [[encodeLine(outline)]],
      stations: [],
      routes: [],
    });
    const east = area([
      [8.6, 48.6],
      [9.4, 48.6],
      [9.4, 49.4],
      [8.6, 49.4],
    ]);
    const days = rainDays(weather, areaCells(grid, east), DAY1);
    expect(days.slice(0, 3)).toEqual(["wet", "dry", undefined]);
    expect(worstRain(days)).toBe("wet");
    // Too small for a cell center: the nearest cell.
    const tiny = area([
      [8.01, 49.01],
      [8.02, 49.01],
      [8.02, 49.02],
    ]);
    expect(areaCells(grid, tiny)).toHaveLength(1);
    expect(rainDays(weather, areaCells(grid, tiny), DAY1)[0]).toBe("dry");
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
