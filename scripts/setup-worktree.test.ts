import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const script = resolve(import.meta.dirname, "setup-worktree.js");
let repo: string | undefined;

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

// pnpm data:build runs the script from pipeline/. In a plain checkout, like
// CI, the dataset must stay a real folder, so the deploy can cache it.
test("keeps the dataset in place in the main checkout", () => {
  repo = mkdtempSync(join(tmpdir(), "wayline-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  const dataset = join(repo, "apps/web/public/data/de-test");
  mkdirSync(dataset, { recursive: true });
  mkdirSync(join(repo, "pipeline"));

  const out = execFileSync("node", [script, "--data"], {
    cwd: join(repo, "pipeline"),
    encoding: "utf8",
  });

  expect(out).toContain("This is the main checkout");
  expect(lstatSync(dataset).isSymbolicLink()).toBe(false);
});
