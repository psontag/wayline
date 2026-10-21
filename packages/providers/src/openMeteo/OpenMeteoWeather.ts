import { type LonLat, WaylineError, type WeatherSample } from "@wayline/domain";
import { z } from "zod";
import type { HttpFetch } from "../brouter/fetch";
import { cellOf } from "../mock/FakeWeather";
import type { Forecast, WeatherProvider } from "../types";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 16;
/** Open-Meteo takes many locations per call. Keep URLs short. */
const MAX_CELLS = 50;
const STALE_MS = 2 * 60 * 60 * 1000;

/** Stores forecasts between visits. Each value comes back as it was set. */
export type ForecastCache = {
  get(key: string): Promise<CachedForecast | undefined>;
  set(key: string, value: CachedForecast): Promise<void>;
};
export type CachedForecast = { fetchedAt: number; forecast: Forecast };

const Hourly = z.object({
  time: z.array(z.string()),
  temperature_2m: z.array(z.number().nullable()),
  precipitation: z.array(z.number().nullable()),
  precipitation_probability: z.array(z.number().nullable()),
  wind_speed_10m: z.array(z.number().nullable()),
  wind_direction_10m: z.array(z.number().nullable()),
});
const Location = z.object({ hourly: Hourly });

export function openMeteoUrl(cells: LonLat[], days = FORECAST_DAYS): string {
  const lat = cells.map((c) => c[1]).join(",");
  const lon = cells.map((c) => c[0]).join(",");
  const hourly = Object.keys(Hourly.shape)
    .filter((k) => k !== "time")
    .join(",");
  return `${BASE_URL}?latitude=${lat}&longitude=${lon}&hourly=${hourly}&forecast_days=${days}&timezone=auto`;
}

/** Hourly samples in local time. Hours without a temperature are left out. */
export function parseOpenMeteo(raw: unknown, cells: LonLat[]): Forecast[] {
  // One location gives an object, several give an array.
  const list = z.array(Location).parse(Array.isArray(raw) ? raw : [raw]);
  if (list.length !== cells.length) {
    throw new WaylineError(
      "PROVIDER_UNAVAILABLE",
      `Open-Meteo: ${list.length} locations for ${cells.length} cells`,
    );
  }
  return cells.map((cell, i) => {
    const h = list[i]?.hourly;
    const samples: WeatherSample[] = [];
    if (!h) return { cell, samples };
    for (const [j, time] of h.time.entries()) {
      const temperature = h.temperature_2m[j];
      if (temperature == null) continue;
      samples.push({
        time,
        temperature,
        precipitation: h.precipitation[j] ?? 0,
        precipitationProbability: (h.precipitation_probability[j] ?? 0) / 100,
        windSpeed: h.wind_speed_10m[j] ?? 0,
        windDirection: h.wind_direction_10m[j] ?? 0,
      });
    }
    return { cell, samples };
  });
}

type Pending = {
  cell: LonLat;
  resolve: (f: Forecast) => void;
  reject: (e: unknown) => void;
};

/**
 * Forecasts from Open-Meteo, called from the browser. Cells asked for in the
 * same tick go out as one request, so a stage costs one call.
 */
export class OpenMeteoWeather implements WeatherProvider {
  private queue: Pending[] = [];
  private inFlight = new Map<string, Promise<Forecast>>();

  constructor(
    private options: {
      fetch: HttpFetch;
      cache?: ForecastCache;
      now?: () => number;
    },
  ) {}

  forecast(coord: LonLat): Promise<Forecast> {
    const cell = cellOf(coord);
    const key = cell.join();
    let promise = this.inFlight.get(key);
    if (!promise) {
      promise = this.load(cell).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, promise);
    }
    return promise;
  }

  private async load(cell: LonLat): Promise<Forecast> {
    const key = cell.join();
    const now = this.options.now?.() ?? Date.now();
    const cached = await this.options.cache?.get(key).catch(() => undefined);
    if (cached && now - cached.fetchedAt < STALE_MS) return cached.forecast;
    const forecast = await new Promise<Forecast>((resolve, reject) => {
      if (!this.queue.length) setTimeout(() => void this.flush(), 0);
      this.queue.push({ cell, resolve, reject });
    });
    await this.options.cache
      ?.set(key, { fetchedAt: now, forecast })
      .catch(() => undefined);
    return forecast;
  }

  private async flush() {
    const batch = this.queue;
    this.queue = [];
    for (let i = 0; i < batch.length; i += MAX_CELLS) {
      const part = batch.slice(i, i + MAX_CELLS);
      const cells = part.map((p) => p.cell);
      try {
        const forecasts = await this.fetchCells(cells);
        part.forEach((p, j) => {
          const f = forecasts[j];
          if (f) p.resolve(f);
          else p.reject(new WaylineError("PROVIDER_UNAVAILABLE", "Open-Meteo"));
        });
      } catch (error) {
        for (const p of part) p.reject(error);
      }
    }
  }

  private async fetchCells(cells: LonLat[]): Promise<Forecast[]> {
    let res: Awaited<ReturnType<HttpFetch>>;
    try {
      res = await this.options.fetch(openMeteoUrl(cells));
    } catch (error) {
      throw new WaylineError("PROVIDER_UNAVAILABLE", `Open-Meteo: ${error}`);
    }
    if (!res.ok) {
      throw new WaylineError(
        "PROVIDER_UNAVAILABLE",
        `Open-Meteo: HTTP ${res.status}`,
      );
    }
    return parseOpenMeteo(JSON.parse(await res.text()), cells);
  }
}
