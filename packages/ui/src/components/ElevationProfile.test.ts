import { describe, expect, it } from "vitest";
import {
  curve,
  gradeAt,
  gradeClass,
  niceStep,
  smooth,
} from "./ElevationProfile";

describe("niceStep", () => {
  it("picks round heights", () => {
    expect(niceStep(240, 3, [1, 2, 5, 10])).toBe(100);
    expect(niceStep(130, 3, [1, 2, 5, 10])).toBe(50);
  });
});

describe("smooth", () => {
  it("evens out noise and keeps surface changes", () => {
    const points = [0, 1, 2, 3, 4].map((km) => ({
      km,
      ele: km % 2 ? 110 : 100,
      surface: km < 3 ? ("paved" as const) : ("gravel" as const),
    }));
    const out = smooth(points, 1);
    expect(out[2]?.ele).toBeCloseTo(106.67, 1);
    expect(out.map((p) => p.surface)).toEqual(points.map((p) => p.surface));
  });
});

describe("curve", () => {
  it("keeps flat parts flat", () => {
    const segments = curve([
      [0, 50],
      [10, 50],
      [20, 20],
    ]);
    // A flat start has flat control points: no overshoot.
    expect(segments[0]).toBe("C3.3 50.0 6.7 50.0 10.0 50.0");
  });
});

describe("gradeAt", () => {
  it("is rise over run", () => {
    const points = [
      { km: 0, ele: 100 },
      { km: 1, ele: 150 },
    ];
    expect(gradeAt(points, 0.5, 0.1)).toBeCloseTo(0.05);
  });
});

describe("gradeClass", () => {
  it("splits at 4 % and 7 %", () => {
    expect([0.02, 0.04, 0.06, 0.07, 0.12].map(gradeClass)).toEqual([
      0, 1, 1, 2, 2,
    ]);
  });
});
