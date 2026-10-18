import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Browsers with native light-dark(). Older targets make the CSS minifier
    // rewrite it, which breaks themes forced on a subtree with data-theme.
    cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"],
  },
  // The MapLibre worker uses ES module imports.
  worker: { format: "es" },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
