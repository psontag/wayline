import { type TrainQuery, WaylineError } from "@wayline/domain";
import { z } from "zod";
import type { AbortSignalLike, TrainOption, TrainProvider } from "../types";
import type { HttpFetch } from "../brouter/fetch";

const BASE_URL = "https://v6.db.transport.rest";
const RESULTS = 3;

const Location = z.object({ id: z.string().optional(), type: z.string() });

const Leg = z.object({
  origin: z.object({ name: z.string().optional() }).optional(),
  destination: z.object({ name: z.string().optional() }).optional(),
  departure: z.string().nullable().optional(),
  plannedDeparture: z.string().nullable().optional(),
  arrival: z.string().nullable().optional(),
  plannedArrival: z.string().nullable().optional(),
  walking: z.boolean().optional(),
  line: z.object({ name: z.string().optional() }).optional(),
});
const Journeys = z.object({
  journeys: z.array(z.object({ legs: z.array(Leg) })),
});

export function locationsUrl(name: string): string {
  return `${BASE_URL}/locations?query=${encodeURIComponent(name)}&results=1&addresses=false&poi=false`;
}

export function journeysUrl(
  from: string,
  to: string,
  query: TrainQuery & { time: string },
): string {
  const at = query.arrival ? "arrival" : "departure";
  return `${BASE_URL}/journeys?from=${from}&to=${to}&${at}=${encodeURIComponent(query.time)}&results=${RESULTS}&stopovers=false&remarks=false`;
}

/** First stop or station of a location search. */
export function parseStopId(raw: unknown): string | undefined {
  return z
    .array(Location)
    .parse(raw)
    .find((l) => l.type === "stop" || l.type === "station")?.id;
}

/**
 * Connections from a journey search. Times stay local: the API gives them
 * with the offset of the station.
 */
export function parseJourneys(raw: unknown): TrainOption[] {
  return Journeys.parse(raw).journeys.flatMap(({ legs }) => {
    const rides = legs.filter((leg) => !leg.walking && leg.line);
    const first = rides[0];
    const last = rides.at(-1);
    const departure = first?.plannedDeparture ?? first?.departure;
    const arrival = last?.plannedArrival ?? last?.arrival;
    if (!first || !last || !departure || !arrival) return [];
    return [
      {
        from: first.origin?.name ?? "",
        to: last.destination?.name ?? "",
        departure: departure.slice(0, 16),
        arrival: arrival.slice(0, 16),
        changes: rides.length - 1,
        lines: rides.flatMap((leg) => (leg.line?.name ? [leg.line.name] : [])),
      },
    ];
  });
}

/**
 * Connections from db.transport.rest, a free community API in front of
 * the Deutsche Bahn timetable. Called from the browser.
 */
export class DbRestTrains implements TrainProvider {
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
    return parseJourneys(
      await this.get(journeysUrl(from, to, query), options.signal),
    );
  }

  private stopId(name: string, signal?: AbortSignalLike) {
    let id = this.stops.get(name);
    if (!id) {
      id = this.get(locationsUrl(name), signal).then(parseStopId);
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
        `db.transport.rest: ${String(error)}`,
      );
    }
    if (!res.ok) {
      throw new WaylineError(
        "PROVIDER_UNAVAILABLE",
        `db.transport.rest: ${res.status}`,
      );
    }
    return JSON.parse(await res.text());
  }
}
