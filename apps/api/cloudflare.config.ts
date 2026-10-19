import { bindings, defineConfig, triggers } from "cf/config";

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
    env: {
      // TODO: the id is a placeholder for local D1. Set the real id of the
      // `wayline` database before the first deploy.
      DB: bindings.d1({
        name: "wayline",
        id: "00000000-0000-4000-8000-000000000000",
      }),
    },
    // Deletes expired legs.
    triggers: [triggers.scheduled({ schedule: "0 3 * * *" })],
  },
});
