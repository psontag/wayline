// Lists worktrees and local branches that are merged into origin/main.
// With --yes, removes them. Keeps worktrees with uncommitted changes and the
// current checkout. Route data or a pipeline cache inside a worktree moves to
// the main checkout first.
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const apply = process.argv.includes("--yes");
const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const merged = (ref) => {
  try {
    git(["merge-base", "--is-ancestor", ref, "origin/main"]);
    return true;
  } catch {
    return false;
  }
};

// Working folders of running processes, such as a dev server or a session.
const cwds = (() => {
  try {
    return execFileSync("lsof", ["-d", "cwd", "-Fn"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.startsWith("n/"))
      .map((line) => line.slice(1));
  } catch {
    return [];
  }
})();
const inUse = (path) =>
  cwds.some((cwd) => cwd === path || cwd.startsWith(`${path}/`));

// Older branches ignore only a pipeline/cache folder, not the link.
const dirty = (path) =>
  git(["status", "--porcelain"], path)
    .split("\n")
    .some((line) => line && line !== "?? pipeline/cache");

const here = git(["rev-parse", "--show-toplevel"]);
const main = dirname(resolve(here, git(["rev-parse", "--git-common-dir"])));
git(["fetch", "-q", "--prune", "origin"]);
git(["worktree", "prune"]);

const worktrees = git(["worktree", "list", "--porcelain"])
  .split("\n\n")
  .map((block) => {
    const get = (key) =>
      block
        .split("\n")
        .find((line) => line.startsWith(`${key} `))
        ?.slice(key.length + 1);
    return {
      path: get("worktree"),
      head: get("HEAD"),
      branch: get("branch")?.replace("refs/heads/", ""),
    };
  })
  .filter((wt) => wt.path && wt.path !== main);

const remove = [];
const keep = new Set();
for (const wt of worktrees) {
  const name = wt.branch ?? "detached";
  let reason;
  if (wt.path === here) reason = "current checkout";
  else if (inUse(wt.path)) reason = "a process runs in it";
  else if (!merged(wt.head)) reason = "not merged";
  else if (dirty(wt.path)) reason = "uncommitted changes";
  if (reason) {
    if (wt.branch) keep.add(wt.branch);
    console.log(`keep   ${wt.path} (${name}, ${reason})`);
  } else {
    remove.push(wt);
    console.log(`remove ${wt.path} (${name})`);
  }
}

const branches = git([
  "branch",
  "--merged",
  "origin/main",
  "--format=%(refname:short)",
])
  .split("\n")
  .filter((b) => b && b !== "main" && !keep.has(b));
console.log(`delete ${branches.length} merged branches`);

if (!apply) {
  console.log("Dry run. Add --yes to remove.");
  process.exit(0);
}

const share = join(here, "scripts/setup-worktree.js");
for (const wt of remove) {
  execFileSync("node", [share, "--data"], { cwd: wt.path, stdio: "inherit" });
  // Checked clean above. --force only removes the data links just made.
  git(["worktree", "remove", "--force", wt.path]);
}
if (branches.length) git(["branch", "-d", ...branches]);
console.log(
  `Removed ${remove.length} worktrees and ${branches.length} branches.`,
);
