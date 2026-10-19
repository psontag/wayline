import { bindings, defineConfig } from "cf/config";

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
      DB: bindings.d1({ name: "wayline" }),
    },
  },
});
