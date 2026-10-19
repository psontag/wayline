import {
  type GenerateRequest,
  type Place,
  type Stage,
  statsFromLegs,
  type Stop as StopPlace,
  type Trip,
  TRIP_SCHEMA_VERSION,
} from "@wayline/domain";
import type { Graph, PathStep } from "../graph/Graph";
import { pathToLeg } from "../graph/leg";
import type { Stop } from "./stages";
import type { Stops } from "./stops";

/** Provider name on legs built from the network graph. */
export const GRAPH_PROVIDER = "graph";

export type TripParts = {
  id: string;
  now: Date;
  request: GenerateRequest;
  start: Place;
  end: Place;
  steps: PathStep[];
  stops: Stop[];
};

/** Builds a draft trip from a cut path. One leg per stage. */
export function buildTrip(graph: Graph, places: Stops, p: TripParts): Trip {
  const { request } = p;
  const meta = { provider: GRAPH_PROVIDER, profileHash: request.profile };
  const ends: StopPlace[] = p.stops.map((s) => ({
    ...places.town(s.node),
    locked: false,
    alternatives: s.alternatives.map((a) => places.town(a.node)),
  }));
  ends.push({ ...p.end, locked: false, alternatives: [] });
  // Step index where each stage ends. Point i is reached after step i − 1.
  const cuts = [...p.stops.map((s) => s.index), p.steps.length];

  const stages: Stage[] = ends.map((end, i) => {
    const start = i === 0 ? p.start : stripStop(ends[i - 1] ?? end);
    const steps = p.steps.slice(i === 0 ? 0 : cuts[i - 1], cuts[i]);
    const legs = [pathToLeg(graph, steps, start.coord, end.coord, meta)];
    const last = i === ends.length - 1;
    const hotel = last
      ? undefined
      : places.pickHotel(end.coord, request.hotelBudget);
    return {
      id: `stage-${i + 1}`,
      start,
      end,
      via: [],
      ...(hotel ? { hotel } : {}),
      legs,
      stats: statsFromLegs(legs),
    };
  });

  const stamp = p.now.toISOString();
  return {
    schemaVersion: TRIP_SCHEMA_VERSION,
    id: p.id,
    name: tripName(request.kind, p.start, ends),
    owner: "me",
    createdAt: stamp,
    updatedAt: stamp,
    kind: request.kind,
    ...(request.startDate ? { startDate: request.startDate } : {}),
    settings: {
      profile: request.profile,
      kmPerDay: request.kmPerDay,
      maxAscentPerDay: request.maxAscentPerDay,
      ...(request.hotelBudget ? { hotelBudget: request.hotelBudget } : {}),
      startTime: request.startTime,
      avgSpeed: 18,
    },
    stages,
    sharedWith: [],
  };
}

function stripStop(s: StopPlace): Place {
  const place: Place = { name: s.name, kind: s.kind, coord: s.coord };
  if (s.osmId) place.osmId = s.osmId;
  return place;
}

/**
 * One-way: "Start – End". Loop: "Start – Stop – Start" with the stop in
 * the middle of the trip.
 */
function tripName(
  kind: GenerateRequest["kind"],
  start: Place,
  ends: StopPlace[],
): string {
  const end = ends.at(-1)?.name ?? start.name;
  if (kind === "one-way" || ends.length < 2) return `${start.name} – ${end}`;
  const middle = ends[Math.floor((ends.length - 1) / 2)]?.name ?? "";
  return `${start.name} – ${middle} – ${end}`;
}

/** Signed routes by km on the path, longest first. */
export function routeNames(
  graph: Graph,
  steps: PathStep[],
  limit = 3,
): string[] {
  const km = new Map<string, number>();
  for (const { edge } of steps) {
    const e = graph.edge(edge);
    for (const name of e.routes) km.set(name, (km.get(name) ?? 0) + e.lengthKm);
  }
  return [...km]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/** Length-weighted mean edge score, 0 to 1. */
export function meanScore(graph: Graph, steps: PathStep[]): number {
  let km = 0;
  let sum = 0;
  for (const { edge } of steps) {
    const e = graph.edge(edge);
    km += e.lengthKm;
    sum += e.score * e.lengthKm;
  }
  return km ? sum / km : 0;
}
