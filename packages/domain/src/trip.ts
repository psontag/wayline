import { routePoints } from "./line";
import { type LonLat, type Stats, Trip, type TripKind } from "./schema";
import { tripStats } from "./stats";

/**
 * Validate stored trip JSON. Older schema versions are migrated here
 * once they exist.
 */
export function parseTrip(data: unknown): Trip {
  return Trip.parse(data);
}

/** What the trip list shows. */
export type TripSummary = {
  id: string;
  name: string;
  kind: TripKind;
  owner: string;
  startDate?: string;
  updatedAt: string;
  stageCount: number;
  stats: Stats;
  /** Coarse line of the whole trip, for a thumbnail. */
  preview: LonLat[];
};

export function summarizeTrip(trip: Trip, previewPoints = 64): TripSummary {
  const points = routePoints(trip.stages.flatMap((s) => s.legs));
  const step = Math.max(1, Math.ceil(points.length / previewPoints));
  const preview = points
    .filter((_, i) => i % step === 0 || i === points.length - 1)
    .map((p) => p.coord);
  return {
    id: trip.id,
    name: trip.name,
    kind: trip.kind,
    owner: trip.owner,
    startDate: trip.startDate,
    updatedAt: trip.updatedAt,
    stageCount: trip.stages.length,
    stats: tripStats(trip.stages),
    preview,
  };
}
