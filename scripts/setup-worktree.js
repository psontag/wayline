// Sets up a worktree with the git-ignored local state of the main checkout.
//
// - Links env files and the local D1. All worktrees share one D1, so saved
//   trips stay across branches.
// - Shares the route data and the pipeline cache: they live in the main
//   checkout. Datasets or a cache built in this worktree move there first.
// - Copies latest.json, so each checkout picks its own dataset.
// - Applies migrations.
//
// `--data` only does the data part. `pnpm data:build` runs it after a build.
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
// Absolute: from a subfolder, git prints this path relative to the cwd.
const main = dirname(
  execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
  ).trim(),
);
if (main === root) {
  console.log("This is the main checkout. Nothing to link.");
  process.exit(0);
}
const dataOnly = process.argv.includes("--data");

const data = "apps/web/public/data";
const shared = [
  "pipeline/cache",
  ...new Set(
    [main, root].flatMap((dir) =>
      existsSync(join(dir, data))
        ? readdirSync(join(dir, data))
            .filter((name) => name !== "mock" && name !== "latest.json")
            .filter((name) => !name.startsWith("."))
            .map((name) => `${data}/${name}`)
        : [],
    ),
  ),
];
for (const path of shared) share(path);

const latest = `${data}/latest.json`;
if (!kind(join(root, latest)) && existsSync(join(main, latest))) {
  copyFileSync(join(main, latest), join(root, latest));
  console.log(`copy ${latest}`);
}

if (dataOnly) process.exit(0);

for (const path of [
  "apps/api/.dev.vars",
  "apps/web/.env.local",
  "apps/api/.wrangler/state",
]) {
  if (!existsSync(join(main, path))) {
    console.log(`skip ${path} (missing in main checkout)`);
  } else if (kind(join(root, path))) {
    console.log(`keep ${path}`);
  } else {
    link(path);
  }
}

const { status } = spawnSync(
  "pnpm",
  ["--filter", "@wayline/api", "db:migrate"],
  { cwd: root, stdio: "inherit" },
);
process.exit(status ?? 1);

// Moves a real folder from the worktree to the main checkout, then links it.
function share(path) {
  const source = join(main, path);
  const target = join(root, path);
  const here = kind(target);
  if (here === "link") return;
  if (here === "real") {
    mkdirSync(dirname(source), { recursive: true });
    merge(target, source);
    console.log(`move ${path} to the main checkout`);
  } else if (!existsSync(source)) {
    return;
  }
  link(path);
}

// Moves `from` into `to`. Where both have a file, the newer one stays. It is
// a cache or build output, so the older copy can go.
function merge(from, to) {
  if (kind(to) === "real" && isDir(from) && isDir(to)) {
    for (const name of readdirSync(from)) {
      const child = join(from, name);
      if (kind(child) === "link") rmSync(child);
      else merge(child, join(to, name));
    }
    rmSync(from, { recursive: true });
  } else if (!kind(to) || statSync(from).mtimeMs > lstatSync(to).mtimeMs) {
    rmSync(to, { recursive: true, force: true });
    renameSync(from, to);
  } else {
    rmSync(from, { recursive: true });
  }
}

function isDir(path) {
  return lstatSync(path).isDirectory();
}

function link(path) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(join(main, path), target);
  console.log(`link ${path}`);
}

function kind(path) {
  try {
    return lstatSync(path).isSymbolicLink() ? "link" : "real";
  } catch {
    return undefined;
  }
}
