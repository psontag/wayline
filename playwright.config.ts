import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT) || 5188;

// Browser tests on the mock data with fake providers and trips in browser
// storage, so they need no Worker and no network except the map style.
export default defineConfig({
  testDir: "apps/web/e2e",
  outputDir: "apps/web/e2e/out/results",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "en-GB",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm --filter @wayline/web exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    env: {
      // Set, so they win over apps/web/.env.local.
      VITE_DATA: "mock",
      VITE_ROUTING: "",
      VITE_TRIPS: "",
      VITE_WEATHER: "",
      VITE_TRAINS: "",
    },
  },
});
