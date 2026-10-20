import type { Trip, TripSummary } from "@wayline/domain";

/**
 * Saved trips. Errors are WaylineError with code NOT_FOUND or CONFLICT.
 * Matches the trip endpoints in docs/02-architecture.md.
 */
export interface TripStore {
  /** Own and shared trips, last updated first. */
  list(): Promise<TripSummary[]>;
  get(id: string): Promise<Trip>;
  /**
   * Saves a trip and returns it with a new updatedAt. For a stored trip,
   * trip.updatedAt must match the stored one, otherwise CONFLICT.
   */
  save(trip: Trip): Promise<Trip>;
  delete(id: string): Promise<void>;
  /** Copy with a new id. The name is the caller's choice. */
  duplicate(id: string, name: string): Promise<Trip>;
  /** Emails of friends who can view the trip. Only for the owner. */
  shares(id: string): Promise<string[]>;
  /** Replaces the emails. Returns them as stored. */
  setShares(id: string, emails: string[]): Promise<string[]>;
}
