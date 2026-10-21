/// <reference types="node" />
import { readFileSync } from "node:fs";
import { isErrorCode, type LonLat } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import type { HttpFetch } from "../brouter/fetch";
import {
  type CachedForecast,
  OpenMeteoWeather,
  openMeteoUrl,
  parseOpenMeteo,
} from "./OpenMeteoWeather";

// Recorded answer for the cells around Bamberg and Kronach, two days.
const fixture = readFileSync(
  new URL("../../fixtures/open-meteo/two-cells.json", import.meta.url),
  "utf8",
);
const bamberg: LonLat = [10.85, 49.85];
const kronach: LonLat = [11.35, 50.25];

function recorder(body = fixture, status = 200) {
  const urls: string[] = [];
  const fetch: HttpFetch = async (url) => {
    urls.push(url);
    return { ok: status === 200, status, text: async () => body };
  };
  return { urls, fetch };
}

function memoryCache() {
  const store = new Map<string, CachedForecast>();
  return {
    store,
    get: async (key: string) => store.get(key),
    set: async (key: string, value: CachedForecast) => {
      store.set(key, value);
    },
  };
}

describe("openMeteoUrl", () => {
  it("asks for all cells and the hourly values in local time", () => {
    const url = new URL(openMeteoUrl([bamberg, kronach]));
    expect(url.searchParams.get("latitude")).toBe("49.85,50.25");
    expect(url.searchParams.get("longitude")).toBe("10.85,11.35");
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m",
    );
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("timezone")).toBe("auto");
  });
});

describe("parseOpenMeteo", () => {
  it("turns each location into hourly samples", () => {
    const [first, second] = parseOpenMeteo(JSON.parse(fixture), [
      bamberg,
      kronach,
    ]);
    expect(first!.cell).toEqual(bamberg);
    expect(second!.cell).toEqual(kronach);
    expect(first!.samples).toHaveLength(48);
    const sample = first!.samples[0]!;
    expect(sample.time).toMatch(/^\d{4}-\d{2}-\d{2}T00:00$/);
    expect(sample.precipitationProbability).toBeGreaterThanOrEqual(0);
    expect(sample.precipitationProbability).toBeLessThanOrEqual(1);
    expect(sample.windDirection).toBeLessThanOrEqual(360);
  });

  it("reads a single location as an object", () => {
    const [one] = JSON.parse(fixture) as unknown[];
    expect(parseOpenMeteo(one, [bamberg])[0]!.samples).toHaveLength(48);
  });

  it("skips hours without a temperature", () => {
    const [one] = JSON.parse(fixture) as {
      hourly: { temperature_2m: (number | null)[] };
    }[];
    one!.hourly.temperature_2m[5] = null;
    expect(parseOpenMeteo(one, [bamberg])[0]!.samples).toHaveLength(47);
  });
});

describe("OpenMeteoWeather", () => {
  it("sends cells asked for together as one request", async () => {
    const { urls, fetch } = recorder();
    const weather = new OpenMeteoWeather({ fetch });
    const [a, b] = await Promise.all([
      weather.forecast([10.86, 49.88]),
      weather.forecast([11.33, 50.24]),
    ]);
    expect(urls).toHaveLength(1);
    expect(a.cell).toEqual(bamberg);
    expect(b.cell).toEqual(kronach);
  });

  it("asks once for the same cell", async () => {
    const { urls, fetch } = recorder(JSON.stringify(JSON.parse(fixture)[0]));
    const weather = new OpenMeteoWeather({ fetch });
    await Promise.all([
      weather.forecast([10.86, 49.88]),
      weather.forecast([10.89, 49.81]),
    ]);
    expect(urls).toHaveLength(1);
  });

  it("uses a fresh cached forecast without a call", async () => {
    const cache = memoryCache();
    let now = 1_000_000;
    const first = recorder(JSON.stringify(JSON.parse(fixture)[0]));
    await new OpenMeteoWeather({ ...first, cache, now: () => now }).forecast(
      bamberg,
    );
    const again = recorder();
    const weather = new OpenMeteoWeather({ ...again, cache, now: () => now });
    await weather.forecast(bamberg);
    expect(again.urls).toHaveLength(0);

    now += 3 * 60 * 60 * 1000;
    await weather.forecast(bamberg).catch(() => undefined);
    expect(again.urls).toHaveLength(1);
  });

  it("fails as unavailable on an HTTP error", async () => {
    const { fetch } = recorder("{}", 429);
    const error = await new OpenMeteoWeather({ fetch })
      .forecast(bamberg)
      .catch((e: unknown) => e);
    expect(isErrorCode(error, "PROVIDER_UNAVAILABLE")).toBe(true);
  });
});
