import {
  decodeLine,
  type GenerateRequest,
  type LonLat,
  type Place,
  pointAtKm,
  type Proposal,
  type ProposalCharacter,
  type RouteTag,
  routePoints,
  type Stage,
  statsFromLegs,
  type Trip,
} from "@wayline/domain";
import { corridorShare } from "@wayline/planner";
import { useQuery } from "@tanstack/react-query";
import { useServices } from "../../data/ServicesProvider";
import type { RouteFn } from "./edits";

/** Another route from the stage's start to its stop. */
export type OtherWay = {
  id: string;
  character?: ProposalCharacter;
  tags: RouteTag[];
  /** Best-known towns on the way. */
  via: string[];
  route: Pick<Stage, "via" | "legs" | "stats">;
  line: LonLat[];
};

const MAX_WAYS = 3;
/** A way with more of its km near the current route is no real choice. */
const MAX_SHARED = 0.7;
const CORRIDOR_KM = 1;
/** All ways leave the start and reach the stop the same way. */
const ENDS_KM = 3;

// Only where the ride starts and ends. A train station of the place doesn't
// matter here.
const at = ({ name, kind, coord }: Place): Place => ({ name, kind, coord });

/** One day from the stage's start to its stop, as the generator plans it. */
export function otherWaysRequest(trip: Trip, stage: Stage): GenerateRequest {
  return {
    kind: "one-way",
    startStation: at(stage.start),
    endStation: at(stage.end),
    days: 1,
    kmPerDay: stage.stats.distance / 1000,
    maxAscentPerDay: trip.settings.maxAscentPerDay,
    startTime: trip.settings.startTime,
    // Some are dropped as too close to the route or to each other.
    maxProposals: MAX_WAYS + 2,
  };
}

const lineOf = (stage: Pick<Stage, "legs">) =>
  stage.legs.flatMap((leg) => decodeLine(leg.geometry));

/**
 * Proposals that differ from the stage's route and from each other, at
 * most 3, in the order given.
 */
export function differentWays(stage: Stage, proposals: Proposal[]): Proposal[] {
  const ends = [stage.start.coord, stage.end.coord];
  const kept: LonLat[][] = [lineOf(stage)];
  const out: Proposal[] = [];
  for (const p of proposals) {
    const day = p.trip.stages[0];
    if (!day || out.length === MAX_WAYS) continue;
    const line = lineOf(day);
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

/** Via points that hold a route: evenly along it, without the ends. */
const VIAS = 3;

export function viasAlong(legs: Stage["legs"]): Place[] {
  const points = routePoints(legs);
  const km = points.at(-1)?.km ?? 0;
  return Array.from({ length: VIAS }, (_, i) => ({
    name: "",
    kind: "custom" as const,
    coord: pointAtKm(points, (km * (i + 1)) / (VIAS + 1)).coord,
  }));
}

/**
 * The proposal's way, routed like an edited stage: from the stage's own
 * start to its own stop, through a few via points along the proposal. The
 * generator may start or end at a station nearby.
 */
export async function routeWay(
  stage: Stage,
  proposal: Proposal,
  route: RouteFn,
): Promise<OtherWay | undefined> {
  const day = proposal.trip.stages[0];
  if (!day) return undefined;
  const via = viasAlong(day.legs);
  const legs = await route([
    stage.start.coord,
    ...via.map((v) => v.coord),
    stage.end.coord,
  ]);
  const stats = statsFromLegs(legs);
  return {
    id: proposal.id,
    ...(proposal.character && { character: proposal.character }),
    tags: proposal.tags ?? [],
    via: proposal.via,
    route: { via, legs, stats },
    line: lineOf({ legs }),
  };
}

/**
 * Other ways for a stage, searched while `enabled`. Kept per trip version,
 * so an edit searches again.
 */
export function useOtherWays(trip: Trip, index: number, enabled: boolean) {
  const { generator, routing } = useServices();
  const stage = trip.stages[index];
  return useQuery({
    queryKey: ["otherWays", trip.id, trip.updatedAt, index],
    queryFn: async ({ signal }): Promise<OtherWay[]> => {
      if (!stage) return [];
      const result = await generator.generate(otherWaysRequest(trip, stage), {
        signal,
      });
      if (!result.ok) return [];
      const route: RouteFn = (points) =>
        routing.route(points, { profile: trip.settings.profile });
      const ways = await Promise.all(
        differentWays(stage, result.proposals).map((p) =>
          routeWay(stage, p, route),
        ),
      );
      return ways.filter((w): w is OtherWay => !!w);
    },
    enabled: enabled && !!stage,
    staleTime: Infinity,
    retry: false,
  });
}
