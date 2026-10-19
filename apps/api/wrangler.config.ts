import { defineWranglerConfig } from "wrangler/experimental-config";

// Build settings for cf with the Wrangler bundler.
export default defineWranglerConfig({
  types: { generate: true },
  assetsDirectory: "../web/dist",
});
