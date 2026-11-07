-- Routes are made in the browser, so the leg cache is not used.
DROP INDEX IF EXISTS legs_expires_at;
DROP TABLE IF EXISTS legs;
