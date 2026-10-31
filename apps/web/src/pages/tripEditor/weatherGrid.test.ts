import type { LonLat, WeatherSample } from "@wayline/domain";
import type { Forecast } from "@wayline/providers";
import { describe, expect, it } from "vitest";
import {
  fieldAt,
  type Grid,
  gridOf,
  rainAlpha,
  rainImage,
  windArrows,
} from "./weatherGrid";

const TIME = "2026-06-14T10:00";

function sample(
  values: Partial<WeatherSample> & { windDirection: number },
): WeatherSample {
  return {
    time: TIME,
    temperature: 15,
    precipitation: 0,
    precipitationProbability: 0,
    windSpeed: 20,
    apparentTemperature: 14,
    windGusts: 30,
    ...values,
  };
}

function forecasts(grid: Grid, s: (cell: LonLat) => WeatherSample): Forecast[] {
  return grid.cells.map((cell) => ({ cell, samples: [s(cell)], daylight: [] }));
}

describe("gridOf", () => {
  it("covers the route with room around it, row by row", () => {
    const grid = gridOf([
      [11.02, 50.01],
      [11.21, 50.08],
    ]);
    if (!grid) throw new Error("no grid");
    expect(grid.cells).toHaveLength(grid.cols * grid.rows);
    const [first] = grid.cells;
    const last = grid.cells.at(-1);
    expect(first?.[0]).toBeLessThan(11.02 - 0.1);
    expect(first?.[1]).toBeLessThan(50.01 - 0.1);
    expect(last?.[0]).toBeGreaterThan(11.21 + 0.1);
    expect(last?.[1]).toBeGreaterThan(50.08 + 0.1);
    // Second cell is east of the first.
    expect(grid.cells[1]?.[0]).toBeCloseTo((first?.[0] ?? 0) + grid.step);
    // Every cell is a center of the 0.1° grid.
    for (const [lon, lat] of grid.cells) {
      expect(Math.round(lon * 100) % 10).toBe(5);
      expect(Math.round(lat * 100) % 10).toBe(5);
    }
  });

  it("thins out long routes", () => {
    const grid = gridOf([
      [10.5, 49.6],
      [12.2, 50.5],
    ]);
    expect(grid?.step).toBeCloseTo(0.2);
    expect(grid?.cells.length).toBeLessThanOrEqual(150);
  });

  it("is undefined without a route", () => {
    expect(gridOf([])).toBeUndefined();
  });
});

describe("fieldAt", () => {
  const grid = gridOf([[11.05, 50.05]]);
  if (!grid) throw new Error("no grid");

  it("is undefined when a cell has no forecast at that time", () => {
    const f = forecasts(grid, () => sample({ windDirection: 0 }));
    expect(fieldAt(grid, f, "2026-07-01T10:00")).toBeUndefined();
  });

  it("turns wind from the west into a vector to the east", () => {
    const f = forecasts(grid, () => sample({ windDirection: 270 }));
    const field = fieldAt(grid, f, TIME);
    expect(field?.east[0]).toBeCloseTo(20);
    expect(field?.north[0]).toBeCloseTo(0);
  });
});

describe("windArrows", () => {
  const grid = gridOf([[11.05, 50.05]]);
  if (!grid) throw new Error("no grid");

  it("adds arrows between cells and keeps their direction", () => {
    const f = forecasts(grid, () => sample({ windDirection: 270 }));
    const field = fieldAt(grid, f, TIME);
    if (!field) throw new Error("no field");
    const arrows = windArrows(field, grid.step / 4);
    expect(arrows.features.length).toBeGreaterThan(grid.cells.length * 4);
    for (const a of arrows.features) {
      expect(a.properties.windTo).toBe(90);
      expect(a.properties.windSpeed).toBeCloseTo(20);
    }
  });

  it("blends speed between cells", () => {
    const f = forecasts(grid, ([lon]) =>
      sample({
        windDirection: 0,
        windSpeed: lon < (grid.cells[0]?.[0] ?? 0) + 0.05 ? 10 : 30,
      }),
    );
    const field = fieldAt(grid, f, TIME);
    if (!field) throw new Error("no field");
    const arrows = windArrows(field, grid.step / 2);
    // Halfway between the first and second column.
    expect(arrows.features[1]?.properties.windSpeed).toBeCloseTo(20);
  });
});

describe("rainImage", () => {
  it("puts the north row first, with a clear border", () => {
    const grid = gridOf([[11.05, 50.05]]);
    if (!grid) throw new Error("no grid");
    const north = grid.cells.at(-1)?.[1] ?? 0;
    const f = forecasts(grid, ([, lat]) =>
      sample({ windDirection: 0, precipitation: lat === north ? 3 : 0 }),
    );
    const field = fieldAt(grid, f, TIME);
    if (!field) throw new Error("no field");
    const image = rainImage(field);
    const width = grid.cols + 2;
    expect(image.alpha.slice(0, width)).toEqual(Array(width).fill(0));
    expect(image.alpha.slice(width + 1, width + 1 + grid.cols)).toEqual(
      Array(grid.cols).fill(rainAlpha(3)),
    );
    expect(image.alpha).toHaveLength(width * (grid.rows + 2));
    expect(image.coordinates[0][1]).toBeCloseTo(north + grid.step * 1.5);
  });

  it("hides traces and caps heavy rain", () => {
    expect(rainAlpha(0.01)).toBe(0);
    expect(rainAlpha(0.2)).toBeGreaterThan(0);
    expect(rainAlpha(10)).toBe(0.5);
  });
});
