import { bearing, pointAtKm, type RoutePoint } from "./line";
import type { Daylight, LonLat, WeatherSample } from "./schema";
import { addHours, expectedTimeAtKm, ridingHours, timeToHours } from "./time";

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
  /** Feels-like temperature. */
  feelsLike: { min: number; max: number };
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
  const range = (values: number[]) => ({
    min: Math.min(...values),
    max: Math.max(...values),
  });
  return {
    points: out,
    wind: windShares(wind),
    temperature: range(out.map((p) => p.sample.temperature)),
    feelsLike: range(out.map((p) => p.sample.apparentTemperature)),
    maxPrecipitation: Math.max(...out.map((p) => p.sample.precipitation)),
  };
}

/**
 * Where the wind blows to, relative to the way ahead, in degrees.
 * 0 pushes from behind, 180 blows into the face.
 */
export function windRotation(travelBearing: number, windFrom: number): number {
  return (((windFrom + 180 - travelBearing) % 360) + 360) % 360;
}

export type HourWeather = {
  /** Local time "YYYY-MM-DDTHH:00". */
  time: string;
  /** mm, highest value on the route. */
  precipitation: number;
  /** 0 to 1, highest value on the route. */
  precipitationProbability: number;
  /** Mean over the route. */
  temperature: number;
  apparentTemperature: number;
  windSpeed: number;
  /** km/h, strongest gust on the route. */
  windGusts: number;
  wind: WindKind;
  /** See windRotation. */
  rotation: number;
};

/**
 * Weather over the whole route for each hour of a day, as if the rider
 * were everywhere at once. Hours without a forecast are left out.
 */
export function hourlyAlongStage(
  points: RoutePoint[],
  date: string,
  forecastAt: (coord: LonLat, time: string) => WeatherSample | undefined,
  hours: number[],
  stepKm = 5,
): HourWeather[] {
  const length = points.at(-1)?.km ?? 0;
  const steps = Math.max(1, Math.ceil(length / stepKm));
  const coords = Array.from(
    { length: steps + 1 },
    (_, i) => pointAtKm(points, (length * i) / steps).coord,
  );
  const out: HourWeather[] = [];
  for (const h of hours) {
    const time = `${date}T${String(h).padStart(2, "0")}:00`;
    const samples = coords.map((c) => forecastAt(c, time));
    if (samples.some((s) => !s)) continue;
    const list = samples as WeatherSample[];
    const mean = (f: (s: WeatherSample) => number) =>
      list.reduce((sum, s) => sum + f(s), 0) / list.length;
    // Wind as a vector relative to the way ahead, summed over the segments.
    let vx = 0;
    let vy = 0;
    coords.slice(1).forEach((next, i) => {
      const s = list[i];
      const prev = coords[i];
      if (!s || !prev) return;
      const r =
        (windRotation(bearing(prev, next), s.windDirection) * Math.PI) / 180;
      vx += Math.cos(r) * s.windSpeed;
      vy += Math.sin(r) * s.windSpeed;
    });
    const rotation = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;
    out.push({
      time,
      precipitation: Math.max(...list.map((s) => s.precipitation)),
      precipitationProbability: Math.max(
        ...list.map((s) => s.precipitationProbability),
      ),
      temperature: mean((s) => s.temperature),
      apparentTemperature: mean((s) => s.apparentTemperature),
      windSpeed: mean((s) => s.windSpeed),
      windGusts: Math.max(...list.map((s) => s.windGusts)),
      wind: relativeWind(0, (rotation + 180) % 360),
      rotation,
    });
  }
  return out;
}

/** mm per hour from which an hour counts as rainy. */
export const RAIN_MM = 0.1;
/** km/h from which a headwind is worth mentioning. */
export const HEADWIND_KMH = 10;

/** When something happens during a ride, as local times. */
export type Span =
  | { kind: "none" }
  | { kind: "all" }
  | { kind: "until"; time: string }
  | { kind: "from"; time: string }
  | { kind: "between"; from: string; to: string };

/** flags[i] holds from times[i] to times[i + 1]. */
function span(flags: boolean[], times: string[]): Span {
  const first = flags.indexOf(true);
  const last = flags.lastIndexOf(true);
  if (first < 0) return { kind: "none" };
  if (first === 0 && last === flags.length - 1) return { kind: "all" };
  const start = times[first] ?? "";
  const end = times[last + 1] ?? times.at(-1) ?? "";
  if (first === 0) return { kind: "until", time: end };
  if (last === flags.length - 1) return { kind: "from", time: start };
  return { kind: "between", from: start, to: end };
}

export type RideSummary = {
  rain: Span;
  headwind: Span;
  /** Main wind over the ride. */
  wind: WindKind;
};

/** When it rains and when the wind is against the rider on a ride. */
export function rideSummary(weather: StageWeather): RideSummary {
  const { points } = weather;
  // Each point with the one after it.
  const segments = points.slice(0, -1).map((p, i) => ({
    ...p,
    next: points[i + 1]?.coord ?? p.coord,
  }));
  // Half hours read better than exact minutes.
  const times = points.map((p) =>
    addHours("00:00", Math.round(timeToHours(p.time.slice(11)) * 2) / 2),
  );
  return {
    rain: span(
      segments.map((p) => p.sample.precipitation >= RAIN_MM),
      times,
    ),
    headwind: span(
      segments.map(
        (p) =>
          p.sample.windSpeed >= HEADWIND_KMH &&
          relativeWind(bearing(p.coord, p.next), p.sample.windDirection) ===
            "head",
      ),
      times,
    ),
    wind: weather.wind.dominant,
  };
}

export type RainKind = "dry" | "light" | "wet";

export function rainKind(weather: StageWeather): RainKind {
  if (weather.maxPrecipitation < RAIN_MM) return "dry";
  return weather.maxPrecipitation < 1 ? "light" : "wet";
}

export type BestStart = {
  start: string;
  weather: StageWeather;
  rain: RainKind;
  wind: WindKind;
};

/** Start times tried for the best start. */
export const BEST_START_FROM = "07:00";
export const BEST_START_TO = "12:00";

/**
 * The start time with the least rain, then the least headwind. Tries every
 * half hour from BEST_START_FROM to BEST_START_TO. Starts before sunrise or
 * ending after sunset are skipped. Ties go to the start closest to
 * `preferred`. Undefined if no start has a forecast.
 */
export function bestStart(
  ride: (start: string) => StageWeather | null,
  options: {
    stats: { distance: number; ascent: number };
    avgSpeed: number;
    preferred: string;
    daylight?: Daylight;
  },
): BestStart | undefined {
  // A long day may not fit into daylight. Then any start will do.
  return pickStart(ride, options, true) ?? pickStart(ride, options, false);
}

function pickStart(
  ride: (start: string) => StageWeather | null,
  options: Parameters<typeof bestStart>[1],
  inDaylight: boolean,
): BestStart | undefined {
  const duration = ridingHours(options.stats, options.avgSpeed);
  const from = timeToHours(BEST_START_FROM);
  const to = timeToHours(BEST_START_TO);
  const light = inDaylight &&
    options.daylight && {
      rise: timeToHours(options.daylight.sunrise.slice(11)),
      set: timeToHours(options.daylight.sunset.slice(11)),
    };
  let best: { score: number[]; result: BestStart } | undefined;
  for (let h = from; h <= to; h += 0.5) {
    if (light && (h < light.rise - 0.25 || h + duration > light.set)) continue;
    const start = addHours("00:00", h);
    const weather = ride(start);
    if (!weather) continue;
    const rain =
      weather.points.reduce((sum, p) => sum + p.sample.precipitation, 0) /
      weather.points.length;
    const headwind = weather.wind.head * weather.wind.avgSpeed;
    // Round so that tiny differences don't outweigh the next criterion.
    const score = [
      Math.round(rain * 5),
      Math.round(headwind / 2),
      Math.abs(h - timeToHours(options.preferred)),
    ];
    if (!best || lexLess(score, best.score)) {
      best = {
        score,
        result: {
          start,
          weather,
          rain: rainKind(weather),
          wind: weather.wind.dominant,
        },
      };
    }
  }
  return best?.result;
}

function lexLess(a: number[], b: number[]): boolean {
  for (const [i, v] of a.entries()) {
    const w = b[i] ?? 0;
    if (v !== w) return v < w;
  }
  return false;
}
