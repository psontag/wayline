import {
  summarizeTrip,
  type Trip,
  type TripSummary,
  WaylineError,
} from "@wayline/domain";
import type { Db } from "./db";

const notFound = (id: string) => new WaylineError("NOT_FOUND", `No trip ${id}`);

/** Own trips and trips shared with the user, last updated first. */
export async function listTrips(db: Db, email: string): Promise<TripSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT summary, 0 AS shared, updated_at FROM trips WHERE owner = ?
       UNION ALL
       SELECT t.summary, 1 AS shared, t.updated_at FROM trips t
       JOIN shares s ON s.trip_id = t.id WHERE s.email = ?
       ORDER BY updated_at DESC`,
    )
    .bind(email, email)
    .all<{ summary: string; shared: number }>();
  return results.map((r) => {
    const summary: TripSummary = JSON.parse(r.summary);
    return r.shared ? { ...summary, shared: true } : summary;
  });
}

/** A trip the user owns or that is shared with them. */
export async function getTrip(db: Db, email: string, id: string) {
  const row = await db
    .prepare(
      `SELECT data, owner FROM trips WHERE id = ? AND (owner = ? OR EXISTS
       (SELECT 1 FROM shares WHERE trip_id = trips.id AND email = ?))`,
    )
    .bind(id, email, email)
    .first<{ data: string; owner: string }>();
  if (!row) throw notFound(id);
  const trip = JSON.parse(row.data) as Trip;
  // Only the owner sees who else can view it.
  if (row.owner !== email) return trip;
  return { ...trip, sharedWith: await shares(db, id) };
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
  // The shares table holds sharedWith.
  const saved: Trip = { ...trip, owner: email, updatedAt, sharedWith: [] };
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
  return { ...saved, sharedWith: prev ? await shares(db, trip.id) : [] };
}

export async function deleteTrip(db: Db, email: string, id: string) {
  const { meta } = await db
    .prepare("DELETE FROM trips WHERE id = ? AND owner = ?")
    .bind(id, email)
    .run();
  if (meta.changes === 0) throw notFound(id);
}

/** Emails the trip is shared with. Only for the owner. */
export async function getShares(db: Db, email: string, id: string) {
  await assertOwner(db, email, id);
  return shares(db, id);
}

/** Replaces the emails the trip is shared with. Only for the owner. */
export async function setShares(
  db: Db,
  email: string,
  id: string,
  emails: string[],
  now = new Date(),
) {
  await assertOwner(db, email, id);
  const wanted = [...new Set(emails)].filter((e) => e !== email);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO shares (trip_id, email, created_at) VALUES (?, ?, ?)",
  );
  await db.batch([
    db
      .prepare(
        "DELETE FROM shares WHERE trip_id = ? AND email NOT IN (SELECT value FROM json_each(?))",
      )
      .bind(id, JSON.stringify(wanted)),
    ...wanted.map((e) => insert.bind(id, e, now.toISOString())),
  ]);
  return shares(db, id);
}

async function shares(db: Db, id: string) {
  const { results } = await db
    .prepare(
      "SELECT email FROM shares WHERE trip_id = ? ORDER BY created_at, email",
    )
    .bind(id)
    .all<{ email: string }>();
  return results.map((r) => r.email);
}

async function assertOwner(db: Db, email: string, id: string) {
  const row = await db
    .prepare("SELECT 1 FROM trips WHERE id = ? AND owner = ?")
    .bind(id, email)
    .first();
  if (!row) throw notFound(id);
}

function conflict() {
  return new WaylineError("CONFLICT", "Trip changed since it was loaded");
}
