import {
  decodeLine,
  distanceKm,
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
import { endNode, legSteps } from "./route";
import { type Stop, STOP_KM } from "./stages";
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

/** Builds a draft trip from a cut path. One leg per piece of about 10 km. */
export function buildTrip(graph: Graph, places: Stops, p: TripParts): Trip {
  const { request } = p;
  const meta = { provider: GRAPH_PROVIDER, profileHash: request.profile };
  const ends: StopPlace[] = p.stops.map((s) => ({
    ...places.town(s.node),
    locked: false,
    alternatives: s.alternatives.map((a) => places.town(a.node)),
  }));
  ends.push({ ...p.end, locked: false, alternatives: [] });
  const stageSteps = splitSteps(p.steps, p.stops);

  const stages: Stage[] = ends.map((end, i) => {
    const start = i === 0 ? p.start : stripStop(ends[i - 1] ?? end);
    const pieces = legSteps(graph, stageSteps[i] ?? []);
    const legs = pieces.map((steps, k) => {
      const from =
        k === 0
          ? start.coord
          : graph.coord(endNode(graph, pieces[k - 1] ?? []) ?? 0);
      const to =
        k === pieces.length - 1
          ? end.coord
          : graph.coord(endNode(graph, steps) ?? 0);
      return pathToLeg(graph, steps, from, to, meta);
    });
    const last = i === ends.length - 1;
    const hotel = last
      ? undefined
      : places.pickHotel(
          end.coord,
          request.hotelBudget,
          legs.flatMap((leg) => decodeLine(leg.geometry)),
        );
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
    name: tripName(request, p.start, ends),
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
      ...(request.backBy ? { backBy: request.backBy } : {}),
      ...(request.dayShares ? { dayShares: request.dayShares } : {}),
      avgSpeed: 18,
    },
    stages,
    sharedWith: [],
    trains: [],
    savedHotels: [],
  };
}

/** Path steps of each stage. */
export function splitSteps(steps: PathStep[], stops: Stop[]): PathStep[][] {
  // Step index where each stage ends. Point i is reached after step i − 1.
  const cuts = [...stops.map((s) => s.index), steps.length];
  return cuts.map((cut, i) => steps.slice(i === 0 ? 0 : cuts[i - 1], cut));
}

function stripStop(s: StopPlace): Place {
  const place: Place = { name: s.name, kind: s.kind, coord: s.coord };
  if (s.osmId) place.osmId = s.osmId;
  return place;
}

/**
 * One-way: "Start – End". Loop: "Start – Stop – Start" with the stop in
 * the middle of the trip. Uses the places the user picked: the stages may
 * start and end at a nearby station instead, for the train links.
 */
function tripName(
  request: GenerateRequest,
  start: Place,
  ends: StopPlace[],
): string {
  const from = request.startStation?.name ?? start.name;
  const last = ends.at(-1)?.name ?? start.name;
  if (request.kind === "one-way") {
    return `${from} – ${request.endStation?.name ?? last}`;
  }
  if (ends.length < 2) return `${from} – ${last}`;
  const middle = ends[Math.floor((ends.length - 1) / 2)]?.name ?? "";
  return `${from} – ${middle} – ${last}`;
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

const PLACE_RANK = { city: 2, town: 1, village: 0 };

/**
 * Up to `limit` well-known towns near the path, in route order. Cities beat
 * towns beat villages. Population, else hotel count, breaks ties.
 */
/** Towns this close to the start are no via. */
const HOME_VIA_KM = 8;

export function viaNames(
  graph: Graph,
  places: Stops,
  start: number,
  steps: PathStep[],
  skip: string[],
  limit = 3,
): string[] {
  const seen = new Set(skip);
  const found: { name: string; order: number; rank: number[] }[] = [];
  const home = graph.coord(start);
  let node = start;
  for (const [order, { edge }] of steps.entries()) {
    node = graph.other(edge, node);
    for (const near of graph.nodesWithin(graph.coord(node), STOP_KM)) {
      const t = places.geoTown(near);
      // "Heidelberg" is no via for a trip from "Heidelberg Hauptbahnhof".
      if (!t || seen.has(t.name) || skip.some((s) => s.startsWith(t.name)))
        continue;
      // Neighbors of the start, like Neu-Ulm for Ulm, say nothing about the way.
      if (distanceKm(home, [t.lon, t.lat]) < HOME_VIA_KM) continue;
      seen.add(t.name);
      const rank = [PLACE_RANK[t.place], t.population ?? 0, t.hotelCount];
      found.push({ name: t.name, order, rank });
    }
  }
  return found
    .sort((a, b) => compareRank(b.rank, a.rank))
    .slice(0, limit)
    .sort((a, b) => a.order - b.order)
    .map((t) => t.name);
}

function compareRank(a: number[], b: number[]): number {
  for (const [i, x] of a.entries()) {
    const d = x - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
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
