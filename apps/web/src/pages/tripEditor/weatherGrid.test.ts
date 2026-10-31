import type { LonLat, WeatherSample } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { gridCells, weatherPoints } from "./weatherGrid";

describe("gridCells", () => {
  it("covers the route with room around it", () => {
    const cells = gridCells([
      [11.02, 50.01],
      [11.21, 50.08],
    ]);
    const lons = cells.map((c) => c[0]);
    const lats = cells.map((c) => c[1]);
    expect(Math.min(...lons)).toBeLessThan(11.02 - 0.1);
    expect(Math.max(...lons)).toBeGreaterThan(11.21 + 0.1);
    expect(Math.min(...lats)).toBeLessThan(50.01 - 0.1);
    expect(Math.max(...lats)).toBeGreaterThan(50.08 + 0.1);
    // Every cell is a center of the 0.1° grid.
    for (const [lon, lat] of cells) {
      expect(Math.round(lon * 100) % 10).toBe(5);
      expect(Math.round(lat * 100) % 10).toBe(5);
    }
    expect(new Set(cells.map((c) => c.join())).size).toBe(cells.length);
  });

  it("thins out long routes", () => {
    const route: LonLat[] = [
      [10.5, 49.6],
      [12.2, 50.5],
    ];
    expect(gridCells(route).length).toBeLessThanOrEqual(150);
  });

  it("is empty without a route", () => {
    expect(gridCells([])).toEqual([]);
  });
});

describe("weatherPoints", () => {
  const sample = (time: string, windDirection: number): WeatherSample => ({
    time,
    temperature: 15,
    precipitation: 1.2,
    precipitationProbability: 0.6,
    windSpeed: 18,
    windDirection,
    apparentTemperature: 14,
    windGusts: 30,
  });

  it("gives the wind the way it blows", () => {
    const points = weatherPoints(
      [
        {
          cell: [11.05, 50.05],
          samples: [sample("2026-06-14T10:00", 270)],
          daylight: [],
        },
      ],
      "2026-06-14T10:00",
    );
    expect(points.features[0]?.properties).toEqual({
      rain: 1.2,
      windSpeed: 18,
      windTo: 90,
    });
  });

  it("leaves out cells without a sample at that time", () => {
    const points = weatherPoints(
      [
        {
          cell: [11.05, 50.05],
          samples: [sample("2026-06-14T10:00", 0)],
          daylight: [],
        },
      ],
      "2026-06-20T10:00",
    );
    expect(points.features).toEqual([]);
  });
});
