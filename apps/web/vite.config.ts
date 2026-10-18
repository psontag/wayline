import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Tailwind v4 baseline.
    cssTarget: ["chrome111", "edge111", "firefox128", "safari16.4"],
  },
  // The MapLibre worker uses ES module imports.
  worker: { format: "es" },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
