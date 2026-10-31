import { describe, expect, it } from "vitest";
import { findClimbs } from "./climbs";
import type { RoutePoint } from "./line";

/** Points every 20 m along a profile given as [km, ele] corners. */
function profile(corners: [number, number][]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (let c = 1; c < corners.length; c++) {
    const [k0, e0] = corners[c - 1]!;
    const [k1, e1] = corners[c]!;
    for (let km = k0; km < k1 - 1e-9; km += 0.02) {
      const ele = e0 + ((e1 - e0) * (km - k0)) / (k1 - k0);
      out.push({ coord: [0, 0], km, ele });
    }
  }
  const [km, ele] = corners.at(-1)!;
  out.push({ coord: [0, 0], km, ele });
  return out;
}

describe("findClimbs", () => {
  it("finds one steady climb", () => {
    const climbs = findClimbs(
      profile([
        [0, 200],
        [2, 200],
        [4, 320],
        [6, 320],
      ]),
    );
    expect(climbs).toHaveLength(1);
    const [c] = climbs;
    expect(c!.gain).toBeGreaterThan(100);
    expect(c!.grade).toBeGreaterThan(5);
    expect(c!.endKm - c!.startKm).toBeGreaterThan(1.8);
  });

  it("keeps a climb through a small dip", () => {
    const climbs = findClimbs(
      profile([
        [0, 200],
        [1, 260],
        [1.2, 255],
        [2, 320],
        [3, 320],
      ]),
    );
    expect(climbs).toHaveLength(1);
  });

  it("splits at a real descent", () => {
    const climbs = findClimbs(
      profile([
        [0, 200],
        [1, 260],
        [2, 200],
        [3, 260],
        [4, 260],
      ]),
    );
    expect(climbs).toHaveLength(2);
  });

  it("ignores rollers and flat ground", () => {
    expect(
      findClimbs(
        profile([
          [0, 200],
          [5, 215],
          [10, 200],
        ]),
      ),
    ).toEqual([]);
    expect(
      findClimbs(
        profile([
          [0, 200],
          [10, 240],
        ]),
      ),
    ).toEqual([]);
  });

  it("measures the steepest 100 m", () => {
    const [c] = findClimbs(
      profile([
        [0, 200],
        [1, 230],
        [1.3, 260],
        [2, 270],
      ]),
    );
    expect(c!.maxGrade).toBeGreaterThan(c!.grade);
    // About 10 % over 300 m. Uneven point spacing may add a little.
    expect(c!.maxGrade).toBeLessThanOrEqual(11.5);
  });
});
