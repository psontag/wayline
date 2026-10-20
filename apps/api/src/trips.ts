import {
  summarizeTrip,
  type Trip,
  type TripSummary,
  WaylineError,
} from "@wayline/domain";
import type { Db } from "./db";

const notFound = (id: string) => new WaylineError("NOT_FOUND", `No trip ${id}`);

/** The user's trips, last updated first. */
export async function listTrips(db: Db, email: string): Promise<TripSummary[]> {
  const { results } = await db
    .prepare(
      "SELECT summary FROM trips WHERE owner = ? ORDER BY updated_at DESC",
    )
    .bind(email)
    .all<{ summary: string }>();
  return results.map((r) => JSON.parse(r.summary));
}

export async function getTrip(db: Db, email: string, id: string) {
  const row = await db
    .prepare("SELECT data FROM trips WHERE id = ? AND owner = ?")
    .bind(id, email)
    .first<{ data: string }>();
  if (!row) throw notFound(id);
  return JSON.parse(row.data) as Trip;
}

/**
 * Saves a trip as the user's. A stored trip must have the same updatedAt,
 * otherwise CONFLICT. Returns the trip with a new updatedAt.
 */
export async function saveTrip(
  db: Db,
  email: string,
  trip: Trip,
  now = new Date(),
): Promise<Trip> {
  const prev = await db
    .prepare("SELECT owner, updated_at FROM trips WHERE id = ?")
    .bind(trip.id)
    .first<{ owner: string; updated_at: string }>();
  if (prev && prev.owner !== email) throw notFound(trip.id);
  if (prev && prev.updated_at !== trip.updatedAt) throw conflict();

  // Always later than the previous value, even within one millisecond.
  const after = prev ? Date.parse(prev.updated_at) + 1 : 0;
  const updatedAt = new Date(Math.max(now.getTime(), after)).toISOString();
  const saved: Trip = { ...trip, owner: email, updatedAt };
  const values = [
    saved.name,
    JSON.stringify(saved),
    JSON.stringify(summarizeTrip(saved)),
    updatedAt,
  ];
  const { meta } = prev
    ? await db
        .prepare(
          "UPDATE trips SET name = ?, data = ?, summary = ?, updated_at = ? WHERE id = ? AND owner = ? AND updated_at = ?",
        )
        .bind(...values, trip.id, email, prev.updated_at)
        .run()
    : await db
        .prepare(
          "INSERT INTO trips (name, data, summary, updated_at, id, owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
        )
        .bind(...values, trip.id, email, saved.createdAt)
        .run();
  // Someone else saved in between.
  if (meta.changes === 0) throw conflict();
  return saved;
}

export async function deleteTrip(db: Db, email: string, id: string) {
  const { meta } = await db
    .prepare("DELETE FROM trips WHERE id = ? AND owner = ?")
    .bind(id, email)
    .run();
  if (meta.changes === 0) throw notFound(id);
}

function conflict() {
  return new WaylineError("CONFLICT", "Trip changed since it was loaded");
}
