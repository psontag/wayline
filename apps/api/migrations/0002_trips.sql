-- Saved trips. A trip is always loaded and saved as a whole.
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  -- Email, lower case
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Trip as JSON
  data TEXT NOT NULL,
  -- TripSummary as JSON, so the list doesn't parse whole trips
  summary TEXT NOT NULL,
  -- ISO timestamps, as in the trip
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX trips_owner ON trips (owner, updated_at);
