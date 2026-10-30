// Downloads the BRouter segments for BW, Hessen and Bayern if missing, then
// starts BRouter in Docker on localhost:17777. On macOS it starts Docker
// Desktop if needed. With a Cloudflare token in .cloudflare.env it also
// starts cloudflared, so the deployed app can route.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
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
const tunnelToken = loadTunnelToken();
run(
  "docker",
  [
    "compose",
    "-f",
    compose,
    ...(tunnelToken ? ["--profile", "tunnel"] : []),
    "up",
    "--build",
  ],
  { ...process.env, TUNNEL_TOKEN: tunnelToken ?? "" },
);

/** Tunnel token from Cloudflare, or undefined to run without the tunnel. */
function loadTunnelToken() {
  const file = join(root, ".cloudflare.env");
  if (!existsSync(file)) return undefined;
  const env = Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
  const { status, stdout, stderr } = spawnSync(
    "node",
    [join(root, "apps/api/scripts/setup-cloudflare.ts"), "--tunnel-token"],
    { env: { ...process.env, ...env }, encoding: "utf8" },
  );
  if (status !== 0) {
    console.warn(`Starting without the tunnel: ${stderr.trim()}`);
    return undefined;
  }
  console.log("Starting cloudflared for the tunnel");
  return stdout.trim();
}

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
