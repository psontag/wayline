/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./legs";

/**
 * Applies new files from migrations/ to a local D1, in name order. Records
 * them in d1_migrations like `cf d1 migrations apply`. Only for tests and
 * local development.
 */
export async function applyMigrations(db: Db): Promise<string[]> {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    )
    .bind()
    .run();
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
  const applied: string[] = [];
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const done = await db
      .prepare("SELECT 1 FROM d1_migrations WHERE name = ?")
      .bind(name)
      .first();
    if (done) continue;
    const statements = readFileSync(join(dir, name), "utf8")
      .replace(/--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sql of statements) await db.prepare(sql).bind().run();
    await db
      .prepare("INSERT INTO d1_migrations (name) VALUES (?)")
      .bind(name)
      .run();
    applied.push(name);
  }
  return applied;
}
