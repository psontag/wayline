// Applies migrations to the local D1 that `cf dev` uses.
// `cf d1 migrations apply --local` hangs after it is done (cf 1.0.0-beta),
// so this opens the same database with Miniflare.
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import type { Db } from "../src/db";
import { applyMigrations } from "../src/migrate.ts";

// Must match the D1 id in cloudflare.config.ts.
const DB_ID = "00000000-0000-4000-8000-000000000000";

const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: "export default {}",
    compatibilityDate: "2026-10-01",
    d1Databases: { DB: DB_ID },
    resourcePersistencePath: new URL("../.wrangler/state/v3", import.meta.url)
      .pathname,
  }),
);
try {
  const db = (await mf.getD1Database("DB")) as unknown as Db;
  const applied = await applyMigrations(db);
  console.log(applied.length ? `Applied ${applied.join(", ")}` : "Up to date");
} finally {
  await mf.dispose();
}
