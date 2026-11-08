import type { ReachRow } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { sameStation } from "../../data/homeStation";
import { bestReach, reachBand, reachDay } from "./reach";

describe("reach", () => {
  it("picks the day type from the date", () => {
    expect(reachDay("2026-11-14")).toBe("saturday");
    expect(reachDay("2026-11-15")).toBe("sunday");
    expect(reachDay("2026-11-16")).toBe("weekday");
  });

  // Direct regional 160 min. With one change 120 min by ICE, 140 regional.
  const row: ReachRow = [160, 120, 110, 160, 140, 140, 0b110];

  it("finds the fastest trip within the changes", () => {
    expect(bestReach(row, { maxChanges: 1, fast: true })).toEqual({
      minutes: 120,
      changes: 1,
      reservation: true,
    });
    expect(bestReach(row, { maxChanges: 2, fast: true })).toEqual({
      minutes: 110,
      changes: 2,
      reservation: true,
    });
  });

  it("uses regional times without IC and ICE", () => {
    expect(bestReach(row, { maxChanges: 2, fast: false })).toEqual({
      minutes: 140,
      changes: 1,
      reservation: false,
    });
  });

  it("skips change counts without a trip", () => {
    const far: ReachRow = [null, null, 200, null, null, null, 0];
    expect(bestReach(far, { maxChanges: 1, fast: true })).toBeUndefined();
    expect(bestReach(far, { maxChanges: 2, fast: true })?.minutes).toBe(200);
  });

  it("bands times by the hour", () => {
    expect([45, 60, 61, 120, 180, 181].map(reachBand)).toEqual([
      1, 1, 2, 2, 3, 4,
    ]);
  });

  it("matches station names", () => {
    expect(sameStation("Karlsruhe Hbf", "Karlsruhe Hauptbahnhof")).toBe(true);
    expect(sameStation("Karlsruhe Hbf", "Karlsruhe-Durlach")).toBe(false);
  });
});
