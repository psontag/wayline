import { type TrainQuery, WaylineError } from "@wayline/domain";
import { z } from "zod";
import type { AbortSignalLike, TrainOption, TrainProvider } from "../types";
import type { HttpFetch } from "../brouter/fetch";

const BASE_URL = "https://api.transitous.org/api/v1";
const RESULTS = 3;
/** Wayline plans trips in Germany. Times in and out are local to it. */
const TIME_ZONE = "Europe/Berlin";

const Stop = z.object({ id: z.string(), type: z.string() });

const Leg = z.object({
  mode: z.string(),
  from: z.object({ name: z.string() }),
  to: z.object({ name: z.string() }),
  scheduledStartTime: z.string(),
  scheduledEndTime: z.string(),
  displayName: z.string().optional(),
  routeShortName: z.string().optional(),
});
const Plan = z.object({
  itineraries: z.array(z.object({ legs: z.array(Leg) })),
});

export function geocodeUrl(name: string): string {
  return `${BASE_URL}/geocode?text=${encodeURIComponent(name)}&type=STOP`;
}

export function planUrl(
  from: string,
  to: string,
  query: TrainQuery & { time: string },
): string {
  const time = `${query.time}:00${utcOffset(query.time)}`;
  return `${BASE_URL}/plan?fromPlace=${encodeURIComponent(from)}&toPlace=${encodeURIComponent(to)}&time=${encodeURIComponent(time)}&arriveBy=${query.arrival ? "true" : "false"}&numItineraries=${RESULTS}`;
}

/** First stop of a geocode search. */
export function parseStopId(raw: unknown): string | undefined {
  return z
    .array(Stop)
    .parse(raw)
    .find((s) => s.type === "STOP")?.id;
}

/**
 * Connections from a plan search, earliest first, in local time. An
 * arrival search keeps the last ones that arrive in time; a departure
 * search the first ones that leave after it.
 */
export function parsePlan(
  raw: unknown,
  query: TrainQuery & { time: string },
): TrainOption[] {
  const all = Plan.parse(raw).itineraries.flatMap(({ legs }) => {
    const rides = legs.filter((leg) => leg.mode !== "WALK");
    const first = rides[0];
    const last = rides.at(-1);
    if (!first || !last) return [];
    return [
      {
        from: first.from.name,
        to: last.to.name,
        departure: localTime(first.scheduledStartTime),
        arrival: localTime(last.scheduledEndTime),
        changes: rides.length - 1,
        lines: rides.map(lineName).filter(Boolean),
      },
    ];
  });
  const sorted = all.sort((a, b) => a.departure.localeCompare(b.departure));
  return query.arrival
    ? sorted.filter((c) => c.arrival <= query.time).slice(-RESULTS)
    : sorted.filter((c) => c.departure >= query.time).slice(0, RESULTS);
}

/** "RE28 (4956)" → "RE28" */
function lineName(leg: z.infer<typeof Leg>): string {
  return (leg.displayName ?? leg.routeShortName ?? "")
    .replace(/\s*\(.*\)$/, "")
    .trim();
}

const localFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-12T07:55:00Z" → "2026-11-12T08:55" */
export function localTime(utc: string): string {
  return localFormat.format(new Date(utc)).replace(" ", "T");
}

/** "+01:00" in winter, "+02:00" in summer. */
export function utcOffset(local: string): string {
  // Read the local time as UTC, then see how far the zone's clock is off.
  const asUtc = new Date(`${local}:00Z`);
  const shown = new Date(`${localTime(asUtc.toISOString())}:00Z`);
  const minutes = Math.round((shown.getTime() - asUtc.getTime()) / 60_000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Connections from Transitous, a free community API built on the open
 * German timetable (DELFI). Called from the browser.
 */
export class TransitousTrains implements TrainProvider {
  private stops = new Map<string, Promise<string | undefined>>();

  constructor(private options: { fetch: HttpFetch }) {}

  async connections(
    query: TrainQuery & { time: string },
    options: { signal?: AbortSignalLike } = {},
  ): Promise<TrainOption[]> {
    const [from, to] = await Promise.all([
      this.stopId(query.from, options.signal),
      this.stopId(query.to, options.signal),
    ]);
    if (!from || !to) return [];
    return parsePlan(
      await this.get(planUrl(from, to, query), options.signal),
      query,
    );
  }

  private stopId(name: string, signal?: AbortSignalLike) {
    let id = this.stops.get(name);
    if (!id) {
      id = this.get(geocodeUrl(name), signal).then(parseStopId);
      // A failed lookup may work next time.
      id.catch(() => this.stops.delete(name));
      this.stops.set(name, id);
    }
    return id;
  }

  private async get(url: string, signal?: AbortSignalLike): Promise<unknown> {
    let res: Awaited<ReturnType<HttpFetch>>;
    try {
      res = await this.options.fetch(url, { signal });
    } catch (error) {
      throw new WaylineError(
        "PROVIDER_UNAVAILABLE",
        `Transitous: ${String(error)}`,
      );
    }
    if (!res.ok) {
      throw new WaylineError(
        "PROVIDER_UNAVAILABLE",
        `Transitous: ${res.status}`,
      );
    }
    return JSON.parse(await res.text());
  }
}
