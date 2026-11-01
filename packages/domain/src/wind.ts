import { decodeLine, encodeLine } from "./line";
import type {
  GenerateRequest,
  Leg,
  Place,
  Stage,
  Stop,
  Trip,
  WeatherSample,
} from "./schema";
import type { WindShares } from "./weather";

/** km/h. Trips ride at this speed until the rider sets their own. */
export const AVG_SPEED_KMH = 18;

/** Below this, wind hardly matters on a bike. km/h. */
export const CALM_KMH = 10;

/** Wind of one day and how far it is ridden. */
export type WindDay = { wind: WindShares; distance: number };

/** Share of the trip's distance ridden into the wind, 0 to 1. Calm days count as none. */
export function headwindShare(days: WindDay[]): number {
  const total = days.reduce((sum, d) => sum + d.distance, 0);
  const head = days.reduce(
    (sum, d) =>
      sum + (d.wind.avgSpeed >= CALM_KMH ? d.wind.head * d.distance : 0),
    0,
  );
  return total ? head / total : 0;
}

/**
 * How hard the wind makes a trip: km into the wind minus km with it,
 * weighted by wind speed. Lower is better; below zero, the wind helps.
 */
export function windEffort(days: WindDay[]): number {
  return days.reduce(
    (sum, d) =>
      sum +
      (d.wind.avgSpeed >= CALM_KMH
        ? (d.distance / 1000) * d.wind.avgSpeed * (d.wind.head - d.wind.tail)
        : 0),
    0,
  );
}

/**
 * A wind option is worth showing when it cuts the headwind share by at
 * least this much, e.g. from 60 % to 40 %.
 */
export const WIND_GAIN = 0.2;

/** The same trip ridden the other way round: last stop first. */
export function reverseTrip(trip: Trip): Trip {
  const first = trip.stages[0]?.start;
  const last = trip.stages.at(-1)?.end;
  const loop = !!first && !!last && first.name === last.name;
  // "Bamberg – Regensburg" for an end at "Regensburg Hauptbahnhof" too.
  const [from, to, ...rest] = trip.name.split(" – ");
  const swapName =
    !loop &&
    !!from &&
    !!to &&
    rest.length === 0 &&
    !!first?.name.startsWith(from) &&
    !!last?.name.startsWith(to);
  return {
    ...trip,
    name: swapName ? `${to} – ${from}` : trip.name,
    stages: reverseStages(trip.stages),
    ...(trip.proposed && { proposed: reverseStages(trip.proposed) }),
    settings: {
      ...trip.settings,
      ...(trip.settings.dayShares && {
        dayShares: [...trip.settings.dayShares].reverse(),
      }),
      ...(trip.settings.rideStarts && {
        rideStarts: [...trip.settings.rideStarts].reverse(),
      }),
    },
    // Saved trains run between the old ends. A loop keeps its station.
    trains: loop ? trip.trains : [],
  };
}

function reverseStages(stages: Stage[]): Stage[] {
  const n = stages.length;
  return stages.map((_, i) => {
    const stage = stages[n - 1 - i] as Stage;
    // The new day ends where the old one started: the end of the day
    // before, with its stop settings and hotel.
    const before = stages[n - 2 - i];
    const end: Stop = before
      ? before.end
      : { ...asPlace(stage.start), locked: true, alternatives: [] };
    const reversed: Stage = {
      id: stage.id,
      start: asPlace(stage.end),
      end,
      via: [...stage.via].reverse(),
      legs: [...stage.legs].reverse().map(reverseLeg),
      stats: {
        ...stage.stats,
        ascent: stage.stats.descent,
        descent: stage.stats.ascent,
      },
    };
    return before?.hotel ? { ...reversed, hotel: before.hotel } : reversed;
  });
}

function reverseLeg(leg: Leg): Leg {
  return {
    ...leg,
    from: leg.to,
    to: leg.from,
    geometry: encodeLine(decodeLine(leg.geometry).reverse()),
    elevation: [...leg.elevation].reverse(),
    ascent: leg.descent,
    descent: leg.ascent,
  };
}

function asPlace({ name, kind, coord, osmId }: Place): Place {
  return osmId ? { name, kind, coord, osmId } : { name, kind, coord };
}

/** Wind at one hour of the ride day. hour is local, 0 to 23. */
export type HourlyWind = { hour: number; from: number; speed: number };

/** Hourly wind of one day from forecast samples. Empty without that day. */
export function dayWind(samples: WeatherSample[], date: string): HourlyWind[] {
  return samples
    .filter((s) => s.time.startsWith(`${date}T`))
    .map((s) => ({
      hour: Number(s.time.slice(11, 13)),
      from: s.windDirection,
      speed: s.windSpeed,
    }));
}

/** Wind at the hour nearest to a time of day, e.g. 10.5. */
export function windAt(
  wind: HourlyWind[],
  hour: number,
): HourlyWind | undefined {
  let best: HourlyWind | undefined;
  for (const w of wind) {
    if (!best || Math.abs(w.hour - hour) < Math.abs(best.hour - hour)) best = w;
  }
  return best;
}

/** A day ride in any direction, back by train. */
export function isOpenRide(request: GenerateRequest): boolean {
  return (
    request.kind === "one-way" && request.days === 1 && !request.endStation
  );
}

/** Day loops and open day rides plan with the wind when asked to. */
export function plansWithWind(request: GenerateRequest): boolean {
  return (
    !!request.withWind &&
    !!request.startDate &&
    (request.kind === "day-loop" || isOpenRide(request))
  );
}
