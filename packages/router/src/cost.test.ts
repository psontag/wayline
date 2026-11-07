import { describe, expect, it } from "vitest";
import { COST_PROFILES, wayFactor } from "./cost";

const HIGHWAYS = ["cycleway", "residential", "ferry"];
const both = (kind: number) => kind | (1 << 12) | (1 << 13);
const est = (c: Partial<Record<string, number>>) =>
  (c.forest ?? 0) |
  ((c.water ?? 0) << 3) |
  ((c.town ?? 0) << 6) |
  ((c.traffic ?? 0) << 9) |
  ((c.noise ?? 0) << 12);

describe("wayFactor", () => {
  it("adds scenery penalties only for scenic", () => {
    const open = est({ town: 6 });
    const forest = est({ forest: 6, water: 6 });
    const { touring, scenic } = COST_PROFILES;
    expect(wayFactor(both(0), HIGHWAYS, touring, open)).toBeCloseTo(1.05);
    expect(wayFactor(both(0), HIGHWAYS, scenic, open)).toBeCloseTo(1.05 + 4.6);
    expect(wayFactor(both(0), HIGHWAYS, scenic, forest)).toBeCloseTo(1.05);
  });

  it("adds traffic and noise only for quiet", () => {
    const loud = est({ traffic: 6, noise: 6 });
    expect(wayFactor(both(1), HIGHWAYS, COST_PROFILES.touring, loud)).toBeCloseTo(1.15);
    expect(wayFactor(both(1), HIGHWAYS, COST_PROFILES.quiet, loud)).toBeCloseTo(4.15);
  });

  it("keeps penalties on signed routes", () => {
    const signed = both(1) | (1 << 11);
    expect(wayFactor(signed, HIGHWAYS, COST_PROFILES.quiet, est({ noise: 6 }))).toBe(3);
  });

  it("costs ferries like BRouter", () => {
    expect(wayFactor(both(2), HIGHWAYS)).toBeCloseTo(5.67);
  });
});
