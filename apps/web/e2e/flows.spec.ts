import { expect, test } from "@playwright/test";
import { open, sampleTrip, screenshots } from "./helpers";

test.describe("desktop flows", () => {
  test.skip(({ isMobile }) => isMobile, "The phone layout has its own editor.");

  test("plan a new trip and open a proposal", async ({ page }, info) => {
    await open(page, "/new");
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("option", { name: /^Bamberg Town/ }).click();
    await page.getByRole("button", { name: "End" }).click();
    await page.getByRole("combobox").last().fill("Coburg");
    await page.getByRole("option", { name: /^Coburg Town/ }).click();
    await screenshots(page, info, "new-trip");

    await page.getByRole("button", { name: "Find routes" }).click();
    await expect(
      page.getByRole("heading", { name: "Bamberg → Coburg" }),
    ).toBeVisible();
    const open1 = page.getByRole("button", { name: "Open trip" });
    await expect(open1).toBeVisible({ timeout: 30_000 });
    await screenshots(page, info, "proposals");

    await open1.click();
    await expect(page).toHaveURL(/\/trips\//);
    await expect(
      page.getByRole("heading", { name: "Bamberg – Coburg" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Day 3 ·/ })).toBeVisible();
    await screenshots(page, info, "trip");
  });

  test("move a stop and keep it after a reload", async ({ page }, info) => {
    await open(page, sampleTrip);
    await page.getByRole("button", { name: /^Day 1 ·/ }).click();
    const stop = page.getByRole("heading", { level: 2, name: /^to / });
    const before = await stop.textContent();

    const other = page.getByRole("button", { name: /^Stop in / }).first();
    const name = (await other.textContent())?.trim();
    await other.click();
    await expect(stop).toHaveText(`to ${name}`);
    expect(before).not.toBe(`to ${name}`);
    await screenshots(page, info, "day");

    // The selected day is in the URL, so the reload opens it again.
    await page.reload();
    await expect(stop).toHaveText(`to ${name}`);
  });
});

test("trip list opens a trip", async ({ page }, info) => {
  await open(page, "/");
  await screenshots(page, info, "trips");
  await page
    .getByRole("link", { name: "Bamberg – Bad Rodach (b Coburg)" })
    .click();
  await expect(page).toHaveURL(sampleTrip);
  await expect(
    page.getByRole("heading", { name: /Bamberg – Bad Rodach/ }).first(),
  ).toBeVisible();
  await screenshots(page, info, "sample-trip");
});
