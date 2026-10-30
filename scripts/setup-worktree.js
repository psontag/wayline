// Links the git-ignored local state of the main checkout into a worktree:
// env files, region data, BRouter segments and the local D1. Then applies
// migrations.
// All worktrees share one D1, so saved trips stay across branches.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const main = dirname(
  resolve(
    root,
    execFileSync("git", ["rev-parse", "--git-common-dir"], {
      encoding: "utf8",
    }).trim(),
  ),
);
if (main === root) {
  console.log("This is the main checkout. Nothing to link.");
  process.exit(0);
}

const data = "apps/web/public/data";
const paths = [
  "apps/api/.dev.vars",
  "apps/web/.env.local",
  "apps/api/.wrangler/state",
  ".cache/brouter",
  ...(existsSync(join(main, data))
    ? readdirSync(join(main, data))
        .filter((name) => name !== "mock")
        .map((name) => `${data}/${name}`)
    : []),
];

for (const path of paths) {
  const source = join(main, path);
  const target = join(root, path);
  if (!existsSync(source)) {
    console.log(`skip ${path} (missing in main checkout)`);
  } else if (exists(target)) {
    console.log(`keep ${path}`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(source, target);
    console.log(`link ${path}`);
  }
}

const { status } = spawnSync(
  "pnpm",
  ["--filter", "@wayline/api", "db:migrate"],
  { cwd: root, stdio: "inherit" },
);
process.exit(status ?? 1);

function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
