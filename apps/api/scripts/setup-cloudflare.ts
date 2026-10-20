// Creates or updates the Cloudflare resources and prints their ids as
// KEY=value lines. In GitHub Actions it also writes them to $GITHUB_ENV, so
// the build picks them up (see cloudflare.config.ts).
//
//   node scripts/setup-cloudflare.ts                 # setup
//   node scripts/setup-cloudflare.ts --tunnel-token  # token for cloudflared
//
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, ACCESS_EMAILS (comma
// separated, setup only).
import { appendFileSync } from "node:fs";
import { setup, tunnelToken } from "../src/setup/cloudflare.ts";

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !accountId) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.");
  process.exit(1);
}

try {
  if (process.argv.includes("--tunnel-token")) {
    process.stdout.write(await tunnelToken({ token, accountId }));
  } else {
    const result = await setup({
      token,
      accountId,
      emails: (process.env.ACCESS_EMAILS ?? "").split(","),
      log: (message) => console.error(message),
    });
    const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
    console.log(lines.join("\n"));
    if (process.env.GITHUB_ENV) {
      appendFileSync(process.env.GITHUB_ENV, lines.join("\n") + "\n");
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
