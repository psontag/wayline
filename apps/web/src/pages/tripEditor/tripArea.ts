import type { LonLat, Trip } from "@wayline/domain";

/** Start and stage ends of a trip. */
export function tripStops(trip: Trip): LonLat[] {
  const first = trip.stages[0]?.start.coord;
  return [...(first ? [first] : []), ...trip.stages.map((s) => s.end.coord)];
}
