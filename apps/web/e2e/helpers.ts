import type { Page, TestInfo } from "@playwright/test";
import { join } from "node:path";

// Default dates and the fake weather depend on today.
const today = new Date("2026-11-08T10:00:00+01:00");
export const sampleTrip = "/trips/sample-bamberg-bad-rodach";

export async function open(page: Page, path: string) {
  await page.clock.setFixedTime(today);
  await page.goto(path);
}

/** Saves the page in light and dark to e2e/out/screenshots/<project>/. */
export async function screenshots(page: Page, info: TestInfo, name: string) {
  const dir = join(import.meta.dirname, "out/screenshots", info.project.name);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    // The base map comes from the network. Give up waiting after a while.
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(dir, `${name}-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: null });
}
