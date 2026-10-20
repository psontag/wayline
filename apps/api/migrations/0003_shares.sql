-- Friends who can view a trip. Only the owner changes them.
CREATE TABLE shares (
  trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  -- Email, lower case
  email TEXT NOT NULL,
  -- ISO timestamp
  created_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, email)
);

CREATE INDEX shares_email ON shares (email);
