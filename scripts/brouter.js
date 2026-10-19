// Downloads the BRouter segments for BW, Hessen and Bayern if missing, then
// starts BRouter in Docker on localhost:17777.
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

if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  console.error(
    "Docker is not running. Start Docker and run `pnpm brouter` again.",
  );
  process.exit(1);
}
run("docker", ["compose", "-f", compose, "up", "--build"]);

function run(command, args) {
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}
