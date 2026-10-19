import { Trip } from "./schema";

/**
 * Validate stored trip JSON. Older schema versions are migrated here
 * once they exist.
 */
export function parseTrip(data: unknown): Trip {
  return Trip.parse(data);
}
