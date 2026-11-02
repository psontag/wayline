import type { LonLat } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { corridorShare } from "./corridor";

// About 20 km east along a latitude.
const line = (lat: number): LonLat[] => [
  [9, lat],
  [9.28, lat],
];

describe("corridorShare", () => {
  it("counts a parallel road as the same corridor", () => {
    expect(corridorShare(line(50), line(50.005), 2)).toBe(1);
  });

  it("does not count a road far away", () => {
    expect(corridorShare(line(50), line(50.2), 2)).toBe(0);
  });

  it("counts only the part in the corridor", () => {
    const half: LonLat[] = [
      [9, 50],
      [9.14, 50],
    ];
    const share = corridorShare(line(50), half, 2);
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.75);
  });

  it("skips parts near the ignored points", () => {
    const a = line(50);
    const start = a[0] as LonLat;
    const other: LonLat[] = [start, [9, 50.2]];
    expect(corridorShare(a, other, 2)).toBeGreaterThan(0);
    expect(corridorShare(a, other, 2, [start], 6)).toBe(0);
  });
});
