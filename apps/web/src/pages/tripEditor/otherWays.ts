import type {
  GenerateRequest,
  LonLat,
  Place,
  Proposal,
  ProposalCharacter,
  RouteTag,
  Stage,
  Trip,
} from "@wayline/domain";
import { corridorShare } from "@wayline/planner";
import { useQuery } from "@tanstack/react-query";
import { useServices } from "../../data/ServicesProvider";
import { stageLine } from "./edits";

/** Another route from the stage's start to its stop. */
export type OtherWay = {
  id: string;
  /** Shown instead of a name from the character and towns. */
  name?: string;
  character?: ProposalCharacter;
  tags: RouteTag[];
  /** Best-known towns on the way. */
  via: string[];
  /** The stage if it rode this way. */
  stage: Stage;
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
    exactEnds: true,
    days: 1,
    kmPerDay: stage.stats.distance / 1000,
    maxAscentPerDay: trip.settings.maxAscentPerDay,
    startTime: trip.settings.startTime,
    // Some are dropped as too close to the route or to each other.
    maxProposals: MAX_WAYS + 2,
  };
}

/**
 * Proposals that differ from the stage's route and from each other, at
 * most 3, in the order given.
 */
export function differentWays(stage: Stage, proposals: Proposal[]): Proposal[] {
  const ends = [stage.start.coord, stage.end.coord];
  const kept: LonLat[][] = [stageLine(stage)];
  const out: Proposal[] = [];
  for (const p of proposals) {
    const day = p.trip.stages[0];
    if (!day || out.length === MAX_WAYS) continue;
    const line = stageLine(day);
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
 * The stage riding the proposal's way. Its legs start and end at the
 * stage's own start and stop, as in a generated trip, so they are taken as
 * they are, without via points.
 */
export function wayOf(stage: Stage, proposal: Proposal): OtherWay | undefined {
  const day = proposal.trip.stages[0];
  if (!day) return undefined;
  return {
    id: proposal.id,
    ...(proposal.character && { character: proposal.character }),
    tags: proposal.tags ?? [],
    via: proposal.via,
    stage: { ...stage, via: [], legs: day.legs, stats: day.stats },
    line: stageLine(day),
  };
}

/**
 * Other ways for a stage, searched while `enabled`. Kept per trip version,
 * so an edit searches again.
 */
export function useOtherWays(trip: Trip, index: number, enabled: boolean) {
  const { generator } = useServices();
  const stage = trip.stages[index];
  return useQuery({
    queryKey: ["otherWays", trip.id, trip.updatedAt, index],
    queryFn: async ({ signal }): Promise<OtherWay[]> => {
      if (!stage) return [];
      const result = await generator.generate(otherWaysRequest(trip, stage), {
        signal,
      });
      if (!result.ok) return [];
      return differentWays(stage, result.proposals).flatMap(
        (p) => wayOf(stage, p) ?? [],
      );
    },
    enabled: enabled && !!stage,
    staleTime: Infinity,
    retry: false,
  });
}
