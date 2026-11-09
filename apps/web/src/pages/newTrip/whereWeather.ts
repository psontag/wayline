import {
  addDays,
  bearing,
  CALM_KMH,
  distanceKm,
  type LonLat,
  type WindKind,
  type WindSegment,
  windEffort,
  windShares,
} from "@wayline/domain";
import type { Forecast } from "@wayline/providers";
import type { Grid, WeatherField } from "../../components/map/weatherGrid";

/** Riding hours of a day, local time: from 9:00 up to 18:00. */
const RIDE_FROM = 9;
const RIDE_TO = 18;
/** mm over the riding hours. Less than DRY_MM is dry, WET_MM and more is wet. */
export const DRY_MM = 0.5;
export const WET_MM = 3;
/** Forecasts more than this many days out are rough. */
export const ROUGH_AFTER_DAYS = 10;
/** Open-Meteo forecasts 16 days, today included. */
export const FORECAST_DAYS = 16;

export type Rain = "dry" | "showers" | "wet";

export function rainOf(mm: number): Rain {
  if (mm < DRY_MM) return "dry";
  return mm < WET_MM ? "showers" : "wet";
}

/** Weather of one cell over the riding hours of a day. */
type CellDay = {
  /** mm */
  rain: number;
  /** Mean wind as a vector, km/h toward east and north. */
  east: number;
  north: number;
};

export type WhereDay = { date: string; cells: CellDay[] };

/** Forecast of each trip day over a grid. Days past the forecast are left out. */
export type WhereWeather = { grid: Grid; days: WhereDay[] };

/** Days from today to date. */
export function daysOut(today: string, date: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

/** True when no day of the trip is within the forecast. */
export function pastForecast(today: string, startDate: string): boolean {
  return daysOut(today, startDate) >= FORECAST_DAYS;
}

function cellDay(forecast: Forecast, date: string): CellDay | undefined {
  let rain = 0;
  let east = 0;
  let north = 0;
  let hours = 0;
  for (const s of forecast.samples) {
    if (!s.time.startsWith(date)) continue;
    const hour = Number(s.time.slice(11, 13));
    if (hour < RIDE_FROM || hour >= RIDE_TO) continue;
    // windDirection is where the wind comes from.
    const to = ((s.windDirection + 180) * Math.PI) / 180;
    rain += s.precipitation;
    east += Math.sin(to) * s.windSpeed;
    north += Math.cos(to) * s.windSpeed;
    hours++;
  }
  if (!hours) return undefined;
  return { rain, east: east / hours, north: north / hours };
}

export function whereWeather(
  grid: Grid,
  forecasts: Forecast[],
  startDate: string,
  days: number,
): WhereWeather {
  const out: WhereDay[] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    const cells = forecasts.map((f) => cellDay(f, date));
    if (cells.every((c): c is CellDay => c !== undefined)) {
      out.push({ date, cells });
    }
  }
  return { grid, days: out };
}

/**
 * The map field of one day. The rain layer is made for mm per hour and is
 * strongest at 3 mm. A third of the day's rain makes WET_MM clearly visible
 * and 9 mm the strongest.
 */
export function dayField(
  weather: WhereWeather,
  date: string,
): WeatherField | undefined {
  const day = weather.days.find((d) => d.date === date);
  if (!day) return undefined;
  return {
    grid: weather.grid,
    rain: day.cells.map((c) => c.rain / 3),
    speed: day.cells.map((c) => Math.hypot(c.east, c.north)),
    east: day.cells.map((c) => c.east),
    north: day.cells.map((c) => c.north),
  };
}

/** Index of the cell nearest to coord. */
function cellIndex(grid: Grid, [lon, lat]: LonLat): number {
  const clamp = (v: number, max: number) =>
    Math.min(Math.max(Math.round(v), 0), max - 1);
  const c = clamp((lon - grid.origin[0]) / grid.step, grid.cols);
  const r = clamp((lat - grid.origin[1]) / grid.step, grid.rows);
  return r * grid.cols + c;
}

/** Dates on which it is wet somewhere along the points. */
export function wetDays(weather: WhereWeather, points: LonLat[]): string[] {
  const cells = new Set(points.map((p) => cellIndex(weather.grid, p)));
  return weather.days
    .filter((d) =>
      [...cells].some((i) => rainOf(d.cells[i]?.rain ?? 0) === "wet"),
    )
    .map((d) => d.date);
}

export type LineWind = {
  /** Lower is better; below zero, the wind helps. See windEffort. */
  effort: number;
  /** Calm when the mean wind is too light to matter. */
  kind: WindKind | "calm";
  /** km/h */
  speed: number;
};

/** Wind along a line ridden from its first point to its last, over all days. */
export function lineWind(weather: WhereWeather, line: LonLat[]): LineWind {
  const days = weather.days.map((day) => {
    const segments: WindSegment[] = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1] as LonLat;
      const b = line[i] as LonLat;
      const cell = day.cells[cellIndex(weather.grid, a)];
      if (!cell) continue;
      const to = (Math.atan2(cell.east, cell.north) * 180) / Math.PI;
      segments.push({
        distance: distanceKm(a, b) * 1000,
        bearing: bearing(a, b),
        windSpeed: Math.hypot(cell.east, cell.north),
        windDirection: (to + 180 + 360) % 360,
      });
    }
    return {
      wind: windShares(segments),
      distance: segments.reduce((sum, s) => sum + s.distance, 0),
    };
  });
  const speed = days.length
    ? days.reduce((sum, d) => sum + d.wind.avgSpeed, 0) / days.length
    : 0;
  const shares = { head: 0, tail: 0, cross: 0 };
  for (const d of days) {
    shares.head += d.wind.head;
    shares.tail += d.wind.tail;
    shares.cross += d.wind.cross;
  }
  const dominant = (Object.keys(shares) as WindKind[]).reduce((a, b) =>
    shares[b] > shares[a] ? b : a,
  );
  return {
    effort: windEffort(days),
    kind: speed < CALM_KMH ? "calm" : dominant,
    speed,
  };
}
