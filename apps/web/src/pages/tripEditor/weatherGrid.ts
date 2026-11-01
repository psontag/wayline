import { type LonLat, sampleAt } from "@wayline/domain";
import { cellOf, type Forecast } from "@wayline/providers";
import type { FeatureCollection, Point } from "geojson";

/** Room around the route, in degrees. */
const PAD = 0.4;
/** Large areas use every second, third, … cell to stay below this. */
const MAX_CELLS = 150;

/** Forecast cells in rows from south to north, each row west to east. */
export type Grid = {
  cells: LonLat[];
  cols: number;
  rows: number;
  /** Center of the south-west cell. */
  origin: LonLat;
  /** Degrees between cell centers. */
  step: number;
};

/**
 * Forecast cells over the area of a route, with some room around it.
 * Cells sit on the 0.1° grid of the forecast cache. Large areas skip cells
 * to keep the number of requests low.
 */
export function gridOf(route: LonLat[]): Grid | undefined {
  if (!route.length) return undefined;
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of route) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  const origin = cellOf([w - PAD, s - PAD]);
  const [e0, n0] = cellOf([e + PAD, n + PAD]);
  const allCols = Math.round((e0 - origin[0]) * 10) + 1;
  const allRows = Math.round((n0 - origin[1]) * 10) + 1;
  let skip = 1;
  while (Math.ceil(allCols / skip) * Math.ceil(allRows / skip) > MAX_CELLS) {
    skip++;
  }
  const cols = Math.ceil(allCols / skip);
  const rows = Math.ceil(allRows / skip);
  const step = skip / 10;
  const cells: LonLat[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(cellOf([origin[0] + c * step, origin[1] + r * step]));
    }
  }
  return { cells, cols, rows, origin, step };
}

/** Weather of every cell of a grid at one time, in the grid's order. */
export type WeatherField = {
  grid: Grid;
  /** mm in this hour */
  rain: number[];
  /** km/h */
  speed: number[];
  /** Wind as a vector, km/h toward east and north. */
  east: number[];
  north: number[];
};

/** The field at a local time "YYYY-MM-DDTHH:MM". Undefined if any cell has no forecast then. */
export function fieldAt(
  grid: Grid,
  forecasts: Forecast[],
  time: string,
): WeatherField | undefined {
  const field: WeatherField = {
    grid,
    rain: [],
    speed: [],
    east: [],
    north: [],
  };
  for (const forecast of forecasts) {
    const s = sampleAt(forecast.samples, time);
    if (!s) return undefined;
    // windDirection is where the wind comes from.
    const to = ((s.windDirection + 180) * Math.PI) / 180;
    field.rain.push(s.precipitation);
    field.speed.push(s.windSpeed);
    field.east.push(Math.sin(to) * s.windSpeed);
    field.north.push(Math.cos(to) * s.windSpeed);
  }
  return field.rain.length === grid.cells.length ? field : undefined;
}

/** Value between cell centers. x and y count cells from the origin. */
function blend(values: number[], grid: Grid, x: number, y: number): number {
  const c0 = Math.min(Math.floor(x), grid.cols - 1);
  const r0 = Math.min(Math.floor(y), grid.rows - 1);
  const c1 = Math.min(c0 + 1, grid.cols - 1);
  const r1 = Math.min(r0 + 1, grid.rows - 1);
  const fx = x - c0;
  const fy = y - r0;
  const at = (r: number, c: number) => values[r * grid.cols + c] ?? 0;
  return (
    (at(r0, c0) * (1 - fx) + at(r0, c1) * fx) * (1 - fy) +
    (at(r1, c0) * (1 - fx) + at(r1, c1) * fx) * fy
  );
}

export type WindArrowProps = {
  /** km/h */
  windSpeed: number;
  /** Degrees the wind blows to. 0 = north. */
  windTo: number;
};

/**
 * Wind arrows on an even grid, blended between cells. spacing is in
 * degrees of longitude. Rows are closer in degrees, so arrows stay evenly
 * spaced on the map.
 */
export function windArrows(
  field: WeatherField,
  spacing: number,
): FeatureCollection<Point, WindArrowProps> {
  const { grid } = field;
  const features: FeatureCollection<Point, WindArrowProps>["features"] = [];
  const lat = grid.origin[1] + ((grid.rows - 1) * grid.step) / 2;
  const dx = spacing / grid.step;
  const dy = (spacing * Math.cos((lat * Math.PI) / 180)) / grid.step;
  for (let y = 0; y <= grid.rows - 1; y += dy) {
    for (let x = 0; x <= grid.cols - 1; x += dx) {
      const east = blend(field.east, grid, x, y);
      const north = blend(field.north, grid, x, y);
      const windTo = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
      features.push({
        type: "Feature",
        properties: {
          windSpeed: blend(field.speed, grid, x, y),
          windTo: Math.round(windTo),
        },
        geometry: {
          type: "Point",
          coordinates: [
            grid.origin[0] + x * grid.step,
            grid.origin[1] + y * grid.step,
          ],
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * Rain as a tiny image, one pixel per cell, rows from north to south.
 * The map blends between pixels. A clear border fades the edge out.
 * alpha is 0 to 1 per pixel.
 */
export function rainImage(field: WeatherField): {
  width: number;
  height: number;
  alpha: number[];
  /** Corners: top left, top right, bottom right, bottom left. */
  coordinates: [LonLat, LonLat, LonLat, LonLat];
} {
  const { grid } = field;
  const alpha: number[] = [];
  for (let r = grid.rows; r >= -1; r--) {
    for (let c = -1; c <= grid.cols; c++) {
      const inside = r >= 0 && r < grid.rows && c >= 0 && c < grid.cols;
      alpha.push(inside ? rainAlpha(field.rain[r * grid.cols + c] ?? 0) : 0);
    }
  }
  const half = grid.step * 1.5;
  const w = grid.origin[0] - half;
  const s = grid.origin[1] - half;
  const e = grid.origin[0] + (grid.cols - 1) * grid.step + half;
  const n = grid.origin[1] + (grid.rows - 1) * grid.step + half;
  return {
    width: grid.cols + 2,
    height: grid.rows + 2,
    alpha,
    coordinates: [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ],
  };
}

/** Light rain shows faintly, 3 mm and more is strongest. */
export function rainAlpha(mm: number): number {
  if (mm < 0.05) return 0;
  return Math.min(0.5, 0.12 + (mm / 3) * 0.38);
}
