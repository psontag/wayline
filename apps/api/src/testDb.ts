import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import type { Db } from "./db";
import { applyMigrations } from "./migrate";

/** Local D1 in Miniflare, with our migrations applied. For tests. */
export async function openTestDb() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {}",
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
    }),
  );
  const db = (await mf.getD1Database("DB")) as unknown as Db;
  await applyMigrations(db);
  return { db, dispose: () => mf.dispose() };
}
