import type { LonLat, StageWeather, WeatherSample } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { stageWind, tripSummary, tripWeatherPoints } from "./stageWeather";

function sample(values: Partial<WeatherSample>): WeatherSample {
  return {
    time: "2026-06-14T10:00",
    temperature: 15,
    precipitation: 0,
    precipitationProbability: 0,
    windSpeed: 10,
    windDirection: 0,
    apparentTemperature: 14,
    windGusts: 20,
    ...values,
  };
}

/** A day riding north, with a point every 10 km. */
function day(
  km: number,
  values: Partial<WeatherSample> = {},
  wind: Partial<StageWeather["wind"]> = {},
): StageWeather {
  const points = Array.from({ length: km / 10 + 1 }, (_, i) => ({
    km: i * 10,
    coord: [10, 50 + i * 0.09] as LonLat,
    time: `2026-06-14T${String(9 + i).padStart(2, "0")}:00`,
    sample: sample(values),
  }));
  return {
    points,
    wind: {
      head: 0,
      tail: 1,
      cross: 0,
      dominant: "tail",
      avgSpeed: 10,
      ...wind,
    },
    temperature: { min: 15, max: 15 },
    feelsLike: { min: 14, max: 14 },
    maxPrecipitation: values.precipitation ?? 0,
  };
}

describe("stageWind", () => {
  it("names the main wind", () => {
    const wind = {
      cross: 0.47,
      tail: 0.3,
      head: 0.23,
      dominant: "cross" as const,
    };
    expect(stageWind(day(60, {}, { ...wind, avgSpeed: 14 })).kind).toBe(
      "cross",
    );
  });

  it("says calm below 10 km/h, whatever the shares", () => {
    const wind = { cross: 0.47, dominant: "cross" as const, avgSpeed: 4 };
    expect(stageWind(day(60, {}, wind)).kind).toBe("calm");
  });
});

describe("tripWeatherPoints", () => {
  it("puts each day after the one before on the trip km", () => {
    const points = tripWeatherPoints([day(20), day(30)]);
    expect(points.map((p) => [p.day, p.km])).toEqual([
      [0, 0],
      [0, 10],
      [0, 20],
      [1, 20],
      [1, 30],
      [1, 40],
      [1, 50],
    ]);
  });

  it("gives the wind relative to the way ahead", () => {
    // Riding north, wind from the north.
    const [head] = tripWeatherPoints([day(10, { windDirection: 0 })]);
    expect(head?.wind.kind).toBe("head");
    expect(head?.wind.rotation).toBeCloseTo(180, 0);
    const last = tripWeatherPoints([day(10, { windDirection: 180 })]).at(-1);
    expect(last?.wind.kind).toBe("tail");
  });
});

describe("tripSummary", () => {
  it("names the days with rain and the main wind by distance", () => {
    const summary = tripSummary([
      day(20, {}, { tail: 1, head: 0 }),
      day(60, { precipitation: 1 }, { tail: 0, head: 1 }),
    ]);
    expect(summary).toEqual({ rainDays: [2], wind: "head" });
  });
});
