import {
  addDays,
  type Area,
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
import type { Grid } from "../../components/map/weatherGrid";
import { type AreaReach, areaShape } from "./areas";

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

/** Forecast of each day over a grid. Days without a forecast are left out. */
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

/** The forecast days from today over a grid. */
export function whereWeather(
  grid: Grid,
  forecasts: Forecast[],
  today: string,
): WhereWeather {
  const out: WhereDay[] = [];
  for (let d = 0; d < FORECAST_DAYS; d++) {
    const date = addDays(today, d);
    const cells = forecasts.map((f) => cellDay(f, date));
    if (cells.every((c): c is CellDay => c !== undefined)) {
      out.push({ date, cells });
    }
  }
  return { grid, days: out };
}

/** The days of a trip out of the forecast days. */
export function tripWeather(
  weather: WhereWeather,
  startDate: string,
  days: number,
): WhereWeather {
  const last = addDays(startDate, days - 1);
  return {
    grid: weather.grid,
    days: weather.days.filter((d) => d.date >= startDate && d.date <= last),
  };
}

/** Cells whose center is inside the area. A small area takes the nearest cell. */
export function areaCells(grid: Grid, area: Area): number[] {
  const rings = areaShape(area).coordinates.flat();
  const inside = ([x, y]: LonLat) => {
    let odd = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi = 0, yi = 0] = ring[i] ?? [];
        const [xj = 0, yj = 0] = ring[j] ?? [];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          odd = !odd;
        }
      }
    }
    return odd;
  };
  const cells = grid.cells.flatMap((c, i) => (inside(c) ? [i] : []));
  return cells.length ? cells : [cellIndex(grid, area.label)];
}

/**
 * Rain on each forecast day from today: the worst of the cells. Undefined
 * for days without a forecast.
 */
export function rainDays(
  weather: WhereWeather,
  cells: number[],
  today: string,
): (Rain | undefined)[] {
  const out: (Rain | undefined)[] = Array.from({ length: FORECAST_DAYS });
  for (const day of weather.days) {
    const i = daysOut(today, day.date);
    if (i < 0 || i >= FORECAST_DAYS) continue;
    out[i] = rainOf(Math.max(...cells.map((c) => day.cells[c]?.rain ?? 0)));
  }
  return out;
}

const rank: Record<Rain, number> = { dry: 0, showers: 1, wet: 2 };

/** The worst of some days. Undefined when none has a forecast. */
export function worstRain(days: (Rain | undefined)[]): Rain | undefined {
  let worst: Rain | undefined;
  for (const r of days) {
    if (r && (!worst || rank[r] > rank[worst])) worst = r;
  }
  return worst;
}

/** For sorting: dry first. No forecast counts as dry. */
function rainRank(rain: Rain | undefined): number {
  return rain ? rank[rain] : 0;
}

// Point in polygon is slow enough to do once per grid and area.
const cellCache = new WeakMap<Grid, WeakMap<Area, number[]>>();
function cachedCells(grid: Grid, area: Area): number[] {
  let byArea = cellCache.get(grid);
  if (!byArea) {
    byArea = new WeakMap();
    cellCache.set(grid, byArea);
  }
  let cells = byArea.get(area);
  if (!cells) {
    cells = areaCells(grid, area);
    byArea.set(area, cells);
  }
  return cells;
}

/** Areas within the max time with their rain on each day and on the trip. */
export function withAreaRain(
  areas: AreaReach[],
  weather: WhereWeather | undefined,
  today: string,
  startDate: string,
  days: number,
): AreaReach[] {
  if (!weather) return areas;
  const from = Math.max(daysOut(today, startDate), 0);
  const to = Math.max(daysOut(today, startDate) + days, 0);
  return areas.map((a) => {
    if (a.over) return a;
    const all = rainDays(weather, cachedCells(weather.grid, a.area), today);
    const rain = worstRain(all.slice(from, to));
    return { ...a, days: all, ...(rain && { rain }) };
  });
}

/** Dry on the trip days first. Keeps the order otherwise. */
export function dryFirst(areas: AreaReach[]): AreaReach[] {
  return [...areas].sort((a, b) => rainRank(a.rain) - rainRank(b.rain));
}

/** How many areas are dry, have showers or are wet on each forecast day. */
export function dayCounts(areas: AreaReach[]): Record<Rain, number>[] {
  return Array.from({ length: FORECAST_DAYS }, (_, i) => {
    const counts = { dry: 0, showers: 0, wet: 0 };
    for (const a of areas) {
      const r = a.days?.[i];
      if (r) counts[r]++;
    }
    return counts;
  });
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
