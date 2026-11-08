import type { LonLat } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { linePoints, loopKm, loopsBack } from "./loops";

/** A line through the corners, with a point about every 1 km between. */
function line(...corners: LonLat[]): LonLat[] {
  const out: LonLat[] = [];
  for (const [i, b] of corners.entries()) {
    const a = corners[i - 1];
    if (!a) {
      out.push(b);
      continue;
    }
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 90);
    for (let s = 1; s <= steps; s++) {
      out.push([
        a[0] + ((b[0] - a[0]) * s) / steps,
        a[1] + ((b[1] - a[1]) * s) / steps,
      ]);
    }
  }
  return out;
}

describe("loopKm", () => {
  it("is 0 for a day that keeps going", () => {
    expect(loopKm(linePoints(line([10, 50], [11, 50])))).toBe(0);
  });

  it("counts a loop that comes back to where the day was", () => {
    // 15 km west, 3 km north, back east past the start: a filler loop.
    const day = linePoints(
      line([10, 50], [9.79, 50], [9.79, 50.027], [10.3, 50.027]),
    );
    expect(loopKm(day)).toBeGreaterThan(10);
    expect(loopsBack([day])).toBe(true);
  });

  it("allows a short bend, like a river loop", () => {
    // 6 km out and 6 km back, 2 km apart.
    const day = linePoints(
      line([10, 50], [10.08, 50], [10.08, 50.018], [10, 50.018], [9.7, 50.018]),
    );
    expect(loopKm(day)).toBe(0);
  });
});
