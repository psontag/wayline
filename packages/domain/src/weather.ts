import { bearing, pointAtKm, type RoutePoint } from "./line";
import type { LonLat, WeatherSample } from "./schema";
import { expectedTimeAtKm } from "./time";

export type WindKind = "head" | "tail" | "cross";

/**
 * Wind relative to the direction of travel. Both angles in degrees.
 * windFrom is where the wind comes from, as in weather data.
 */
export function relativeWind(
  travelBearing: number,
  windFrom: number,
): WindKind {
  // Angle between the wind source and the way ahead, 0 to 180.
  const diff = Math.abs(
    ((((windFrom - travelBearing) % 360) + 540) % 360) - 180,
  );
  if (diff <= 45) return "head";
  if (diff >= 135) return "tail";
  return "cross";
}

export type WindSegment = {
  /** Any unit, used as weight. */
  distance: number;
  bearing: number;
  windSpeed: number;
  windDirection: number;
};

export type WindShares = {
  /** Shares of the distance, 0 to 1. */
  head: number;
  tail: number;
  cross: number;
  /** The kind with the largest share. */
  dominant: WindKind;
  /** km/h, weighted by distance. */
  avgSpeed: number;
};

export function windShares(segments: WindSegment[]): WindShares {
  const sum = { head: 0, tail: 0, cross: 0 };
  let total = 0;
  let speed = 0;
  for (const s of segments) {
    sum[relativeWind(s.bearing, s.windDirection)] += s.distance;
    total += s.distance;
    speed += s.windSpeed * s.distance;
  }
  const share = (v: number) => (total ? v / total : 0);
  const shares = {
    head: share(sum.head),
    tail: share(sum.tail),
    cross: share(sum.cross),
  };
  const dominant = (Object.keys(shares) as WindKind[]).reduce((a, b) =>
    shares[b] > shares[a] ? b : a,
  );
  return { ...shares, dominant, avgSpeed: share(speed) };
}

/** Sample closest to a local time. Undefined outside the samples' range. */
export function sampleAt(
  samples: WeatherSample[],
  time: string,
): WeatherSample | undefined {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return undefined;
  const t = Date.parse(`${time}Z`);
  const hour = 3_600_000;
  if (t < Date.parse(`${first.time}Z`) - hour) return undefined;
  if (t > Date.parse(`${last.time}Z`) + hour) return undefined;
  let best = first;
  for (const s of samples) {
    if (
      Math.abs(Date.parse(`${s.time}Z`) - t) <
      Math.abs(Date.parse(`${best.time}Z`) - t)
    ) {
      best = s;
    }
  }
  return best;
}

export type RouteWeatherPoint = {
  km: number;
  coord: LonLat;
  /** Expected local time at this km. */
  time: string;
  sample: WeatherSample;
};

export type StageWeather = {
  points: RouteWeatherPoint[];
  wind: WindShares;
  temperature: { min: number; max: number };
  /** mm, highest hourly value on the way. */
  maxPrecipitation: number;
};

/**
 * Weather along a stage at the expected time at each km.
 * Returns null if any point has no forecast, e.g. beyond the range.
 */
export function weatherAlongStage(
  points: RoutePoint[],
  timing: { date: string; startTime: string; avgSpeed: number },
  forecastAt: (coord: LonLat, time: string) => WeatherSample | undefined,
  stepKm = 5,
): StageWeather | null {
  const length = points.at(-1)?.km ?? 0;
  const out: RouteWeatherPoint[] = [];
  const wind: WindSegment[] = [];
  const steps = Math.max(1, Math.ceil(length / stepKm));
  for (let i = 0; i <= steps; i++) {
    const km = (length * i) / steps;
    const p = pointAtKm(points, km);
    const time = expectedTimeAtKm(
      timing.date,
      timing.startTime,
      timing.avgSpeed,
      km,
    );
    const sample = forecastAt(p.coord, time);
    if (!sample) return null;
    out.push({ km, coord: p.coord, time, sample });
    const prev = out.at(-2);
    if (prev) {
      wind.push({
        distance: km - prev.km,
        bearing: bearing(prev.coord, p.coord),
        windSpeed: prev.sample.windSpeed,
        windDirection: prev.sample.windDirection,
      });
    }
  }
  const temps = out.map((p) => p.sample.temperature);
  return {
    points: out,
    wind: windShares(wind),
    temperature: { min: Math.min(...temps), max: Math.max(...temps) },
    maxPrecipitation: Math.max(...out.map((p) => p.sample.precipitation)),
  };
}
