-- Route legs from the router, shared by all users. Expired rows are
-- deleted by the daily Cron Trigger.
CREATE TABLE legs (
  key TEXT PRIMARY KEY,
  envelope TEXT NOT NULL,
  -- Unix time in ms
  expires_at INTEGER NOT NULL
);

CREATE INDEX legs_expires_at ON legs (expires_at);
