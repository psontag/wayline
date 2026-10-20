import { bindings, defineConfig, triggers } from "cf/config";

// Ids of the deployed resources come from infra/cloudflare/setup.ts, which
// CI runs before the build. Locally they are missing: D1 is local, BRouter
// is at BROUTER_URL from .dev.vars, and there is no Access.
const env = process.env;
const LOCAL_D1_ID = "00000000-0000-4000-8000-000000000000";

export default defineConfig({
  worker: {
    name: "wayline-api",
    compatibilityDate: "2026-10-01",
    entrypoint: "src/index.ts",
    // The SPA and /data/* from apps/web. See wrangler.config.ts.
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
    workersDev: true,
    previewUrls: false,
    observability: { enabled: true },
    env: {
      DB: bindings.d1({
        name: "wayline",
        id: env.WAYLINE_D1_ID ?? LOCAL_D1_ID,
      }),
      ...(env.WAYLINE_BROUTER_SERVICE_ID && {
        BROUTER: bindings.vpcService({ id: env.WAYLINE_BROUTER_SERVICE_ID }),
      }),
      ...(env.WAYLINE_ACCESS_TEAM_DOMAIN &&
        env.WAYLINE_ACCESS_AUD && {
          ACCESS_TEAM_DOMAIN: bindings.text(env.WAYLINE_ACCESS_TEAM_DOMAIN),
          ACCESS_AUD: bindings.text(env.WAYLINE_ACCESS_AUD),
        }),
    },
    // Deletes expired legs.
    triggers: [triggers.scheduled({ schedule: "0 3 * * *" })],
  },
});
