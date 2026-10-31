import { type LonLat, sampleAt } from "@wayline/domain";
import { cellOf, type Forecast } from "@wayline/providers";
import type { FeatureCollection, Point } from "geojson";

/** Room around the route, in degrees. */
const PAD = 0.15;
/** More cells than this use every second cell. */
const MAX_CELLS = 150;

/**
 * Forecast cells over the area of a route, with some room around it.
 * Cells sit on the 0.1° grid of the forecast cache. Long routes use every
 * second cell to keep the number of requests low.
 */
export function gridCells(route: LonLat[]): LonLat[] {
  if (!route.length) return [];
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of route) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  const [w0, s0] = cellOf([w - PAD, s - PAD]);
  const [e0, n0] = cellOf([e + PAD, n + PAD]);
  const cols = Math.round((e0 - w0) * 10) + 1;
  const rows = Math.round((n0 - s0) * 10) + 1;
  const step = cols * rows > MAX_CELLS ? 2 : 1;
  const cells: LonLat[] = [];
  for (let r = 0; r < rows; r += step) {
    for (let c = 0; c < cols; c += step) {
      cells.push(cellOf([w0 + c / 10, s0 + r / 10]));
    }
  }
  return cells;
}

export type WeatherPointProps = {
  /** mm in this hour */
  rain: number;
  /** km/h */
  windSpeed: number;
  /** Degrees the wind blows to. 0 = north. */
  windTo: number;
};

/** Rain and wind of each cell at a local time "YYYY-MM-DDTHH:MM". */
export function weatherPoints(
  forecasts: Forecast[],
  time: string,
): FeatureCollection<Point, WeatherPointProps> {
  return {
    type: "FeatureCollection",
    features: forecasts.flatMap(({ cell, samples }) => {
      const s = sampleAt(samples, time);
      if (!s) return [];
      return [
        {
          type: "Feature",
          properties: {
            rain: s.precipitation,
            windSpeed: s.windSpeed,
            windTo: (s.windDirection + 180) % 360,
          },
          geometry: { type: "Point", coordinates: cell },
        },
      ];
    }),
  };
}
