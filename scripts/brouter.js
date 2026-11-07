// Downloads the BRouter segments for Germany (5–15° E, 45–55° N) if missing, then
// starts BRouter in Docker on localhost:17777. On macOS it starts Docker
// Desktop if needed. Only to compare our router with BRouter.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const segmentsDir = join(root, ".cache/brouter/segments4");
const compose = join(root, "infra/brouter/compose.yaml");
const segmentsUrl =
  process.env.BROUTER_SEGMENTS_URL ?? "https://brouter.de/brouter/segments4";
const tiles = ["E5_N45", "E10_N45", "E5_N50", "E10_N50"];

mkdirSync(segmentsDir, { recursive: true });
for (const tile of tiles) {
  const file = join(segmentsDir, `${tile}.rd5`);
  if (existsSync(file)) continue;
  console.log(`Downloading ${tile}.rd5`);
  // -C - resumes a broken download.
  run("curl", [
    "-fL",
    "--progress-bar",
    "-C",
    "-",
    "-o",
    `${file}.part`,
    `${segmentsUrl}/${tile}.rd5`,
  ]);
  renameSync(`${file}.part`, file);
}

if (!dockerRunning() && !startDocker()) {
  console.error(
    "Docker is not running. Start Docker and run `pnpm brouter` again.",
  );
  process.exit(1);
}
run("docker", ["compose", "-f", compose, "up", "--build"]);

function dockerRunning() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

/** Starts Docker Desktop on macOS and waits up to two minutes for it. */
function startDocker() {
  if (process.platform !== "darwin") return false;
  console.log("Starting Docker Desktop");
  if (spawnSync("open", ["-a", "Docker"]).status !== 0) return false;
  for (let i = 0; i < 60; i++) {
    if (dockerRunning()) return true;
    spawnSync("sleep", ["2"]);
  }
  return false;
}

function run(command, args, env = process.env) {
  const { status } = spawnSync(command, args, { stdio: "inherit", env });
  if (status !== 0) process.exit(status ?? 1);
}
