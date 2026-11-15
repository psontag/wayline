import {
  type Flavour,
  type GenerateRequest,
  type LonLat,
  type Place,
  type Proposal,
  type ProposalCharacter,
  type RouteTag,
  type Stage,
  type Trip,
} from "@wayline/domain";
import { corridorShare } from "@wayline/planner";
import { useQuery } from "@tanstack/react-query";
import { useServices } from "../../data/ServicesProvider";
import { type ChoiceStages, samePlace, stageLine } from "./edits";

/** Another route for a day, to the same stop or another town. */
export type DayRoute = {
  id: string;
  /** Shown instead of a name from the stop or the towns on the way. */
  name?: string;
  flavour?: Flavour;
  character?: ProposalCharacter;
  tags: RouteTag[];
  /** Best-known towns on the way. */
  via: string[];
  /** What taking it writes. */
  stages: ChoiceStages;
  line: LonLat[];
  /** The next day, when the stop moves. */
  nextLine?: LonLat[];
};

const MAX_ROUTES = 6;
/** A route with more of its km near another one is no real choice. */
const MAX_SHARED = 0.7;
const CORRIDOR_KM = 1;
/** All routes leave the start and reach a stop the same way. */
const ENDS_KM = 3;
/** Tomorrow may get this much longer than now or than a full day. */
const NEXT_STRETCH = 1.2;

// Only where the ride starts and ends. A train station of the place doesn't
// matter here.
const at = ({ name, kind, coord }: Place): Place => ({ name, kind, coord });

/** km the trip aims for on a day. */
function dayKm(trip: Trip, index: number): number {
  return trip.settings.kmPerDay * (trip.settings.dayShares?.[index] ?? 1);
}

/**
 * One day as the generator plans it. Days before the last end at towns
 * from which tomorrow's stop is in reach. The last day ends at its stop.
 */
export function dayRoutesRequest(trip: Trip, index: number): GenerateRequest {
  const stage = trip.stages[index];
  if (!stage) throw new Error(`No stage ${index}`);
  const next = trip.stages[index + 1];
  const base = {
    kind: "one-way" as const,
    startStation: at(stage.start),
    exactEnds: true,
    days: 1,
    maxAscentPerDay: trip.settings.maxAscentPerDay,
    startTime: trip.settings.startTime,
    ...(trip.settings.hotelBudget && {
      hotelBudget: trip.settings.hotelBudget,
    }),
  };
  // Around the day as it is, so there are shorter and longer routes.
  const kmPerDay = stage.stats.distance / 1000;
  if (!next) {
    return {
      ...base,
      endStation: at(stage.end),
      kmPerDay,
      maxProposals: MAX_ROUTES,
    };
  }
  const maxKm =
    NEXT_STRETCH * Math.max(next.stats.distance / 1000, dayKm(trip, index + 1));
  return { ...base, kmPerDay, nextStop: { place: at(next.end), maxKm } };
}

/**
 * Proposals that differ from the day's route and from each other, at most
 * 6, in the order given.
 */
export function differentRoutes(
  stage: Stage,
  proposals: Proposal[],
): Proposal[] {
  const kept: LonLat[][] = [stageLine(stage)];
  const out: Proposal[] = [];
  for (const p of proposals) {
    const day = p.trip.stages[0];
    if (!day || out.length === MAX_ROUTES) continue;
    const line = stageLine(day);
    const ends = [stage.start.coord, stage.end.coord, day.end.coord];
    const close = kept.some(
      (other) =>
        corridorShare(line, other, CORRIDOR_KM, ends, ENDS_KM) > MAX_SHARED,
    );
    if (close) continue;
    kept.push(line);
    out.push(p);
  }
  return out;
}

/**
 * The day riding the proposal's route, without via points. Its legs start
 * at the day's own start. To the same stop, the hotel and tomorrow stay.
 * To another town, it takes the proposal's hotel and ride on.
 */
export function routeOf(
  trip: Trip,
  index: number,
  proposal: Proposal,
): DayRoute | undefined {
  const stage = trip.stages[index];
  const next = trip.stages[index + 1];
  const [day, on] = proposal.trip.stages;
  if (!stage || !day) return undefined;
  const moved = !!next && !!on && !samePlace(stage.end, day.end);
  const base = {
    id: proposal.id,
    ...(proposal.flavour && { flavour: proposal.flavour }),
    ...(proposal.character && { character: proposal.character }),
    tags: proposal.tags ?? [],
    via: proposal.via,
    line: stageLine(day),
  };
  if (!moved || !next || !on) {
    return {
      ...base,
      stages: {
        stage: { ...stage, via: [], legs: day.legs, stats: day.stats },
      },
    };
  }
  const today: Stage = {
    ...stage,
    end: { ...day.end, locked: false, alternatives: [] },
    via: [],
    legs: day.legs,
    stats: day.stats,
  };
  delete today.hotel;
  if (day.hotel) today.hotel = day.hotel;
  return {
    ...base,
    stages: {
      stage: today,
      next: {
        ...next,
        start: on.start,
        via: [],
        legs: on.legs,
        stats: on.stats,
      },
    },
    nextLine: stageLine(on),
  };
}

/**
 * Other routes for a day, searched while `enabled`. Kept per trip version,
 * so an edit searches again.
 */
export function useDayRoutes(trip: Trip, index: number, enabled: boolean) {
  const { generator } = useServices();
  const stage = trip.stages[index];
  return useQuery({
    queryKey: ["dayRoutes", trip.id, trip.updatedAt, index],
    queryFn: async ({ signal }): Promise<DayRoute[]> => {
      if (!stage) return [];
      const result = await generator.generate(dayRoutesRequest(trip, index), {
        signal,
      });
      if (!result.ok) return [];
      return differentRoutes(stage, result.proposals).flatMap(
        (p) => routeOf(trip, index, p) ?? [],
      );
    },
    enabled: enabled && !!stage,
    staleTime: Infinity,
    retry: false,
  });
}
