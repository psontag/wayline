import type { LonLat, WeatherSample } from "@wayline/domain";
import type { Forecast, WeatherProvider } from "../types";

/**
 * Made-up June weather. The same cell and hour always give the same values.
 * Covers `days` days from today, like a real forecast.
 */
export class FakeWeather implements WeatherProvider {
  constructor(private options: { now?: () => Date; days?: number } = {}) {}

  async forecast(coord: LonLat): Promise<Forecast> {
    const cell = cellOf(coord);
    const now = this.options.now?.() ?? new Date();
    const days = this.options.days ?? 16;
    const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const samples: WeatherSample[] = [];
    for (let h = 0; h < days * 24; h++) {
      samples.push(sampleFor(cell, new Date(start + h * 3_600_000)));
    }
    return { cell, samples };
  }
}

/** Center of the 0.1° cell. Forecasts are fetched and cached per cell. */
export function cellOf([lon, lat]: LonLat): LonLat {
  const c = (v: number) => Math.round((Math.floor(v * 10) + 0.5) * 100) / 1000;
  return [c(lon), c(lat)];
}

function sampleFor(cell: LonLat, t: Date): WeatherSample {
  const day = Math.floor(t.getTime() / 86_400_000);
  const hour = t.getUTCHours();
  // Weather systems are large: the day's values depend on a coarse 0.5° area.
  const area = Math.round(cell[0] * 2) * 1000 + Math.round(cell[1] * 2);
  const d = (salt: number) => noise(day, area, salt);
  const h = (salt: number) => noise(day * 24 + hour, area, salt);

  const mean = 15 + 6 * d(1);
  // Warmest at 15:00, coldest at 03:00.
  const daily = Math.cos(((hour - 15) / 24) * 2 * Math.PI) * (4 + 2 * d(2));
  const rainChance = Math.round(Math.pow(d(3), 2) * 80) / 100;
  const raining = rainChance > 0.2 && h(4) < rainChance;
  const windFrom = (250 + (d(5) - 0.5) * 180 + (h(6) - 0.5) * 30 + 360) % 360;
  const windSpeed =
    6 + 18 * d(7) + 4 * Math.sin((hour / 24) * Math.PI) + 3 * h(8);

  return {
    time: t.toISOString().slice(0, 16),
    temperature: round1(mean + daily + (h(9) - 0.5)),
    precipitation: raining ? round1(0.2 + 2.5 * h(10)) : 0,
    precipitationProbability: rainChance,
    windSpeed: round1(windSpeed),
    windDirection: Math.round(windFrom),
  };
}

/** Deterministic value in [0, 1). */
function noise(a: number, b: number, salt: number): number {
  let x =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + salt, 0xc2b2ae35);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4_294_967_296;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
