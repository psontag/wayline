// Runs the web app and the Worker. Each checkout gets its own free ports, so
// several worktrees can run at once. PORT sets the web port.
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const api = await freePort(Number(process.env.WAYLINE_API_PORT) || 8787);
console.log(`Worker on http://localhost:${api}`);

const child = spawn("pnpm", ["--recursive", "--parallel", "dev"], {
  stdio: "inherit",
  env: { ...process.env, WAYLINE_API_PORT: String(api) },
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

async function freePort(port) {
  for (let p = port; p < port + 50; p++) {
    if ((await isFree(p, "127.0.0.1")) && (await isFree(p, "::1"))) return p;
  }
  throw new Error(`No free port from ${port}`);
}

// Checks each loopback address: workerd binds them one by one, and on macOS
// a listen on all addresses still succeeds then.
function isFree(port, host) {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", (error) => resolve(error.code === "EADDRNOTAVAIL"))
      .once("listening", () => server.close(() => resolve(true)))
      .listen(port, host);
  });
}
