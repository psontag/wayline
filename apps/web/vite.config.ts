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
  // Vite takes the next free port when this one is in use. scripts/dev.js
  // picks the Worker port.
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      "/api": `http://localhost:${process.env.WAYLINE_API_PORT || 8787}`,
    },
  },
});
