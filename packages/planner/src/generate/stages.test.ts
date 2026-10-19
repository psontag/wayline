import { describe, expect, it } from "vitest";
import { removeSpurs } from "./search";
import { cutStages, type PathPoint, type StopCandidate } from "./stages";

// A straight 300 km path with a node every 10 km and 10 m ascent per km.
const points: PathPoint[] = Array.from({ length: 31 }, (_, i) => ({
  node: i,
  km: i * 10,
  ascent: i * 100,
}));

function town(index: number, hotels = 1, offKm = 0): StopCandidate {
  return { node: 100 + index, index, km: index * 10, offKm, hotels };
}

const options = { days: 4, kmPerDay: 75, maxAscentPerDay: 2000 };

describe("cutStages", () => {
  it("picks stops close to the target km per day", () => {
    const stops = cutStages(
      points,
      [5, 7, 8, 10, 15, 16, 22, 23].map((i) => town(i)),
      options,
    );
    expect(stops?.map((s) => s.km)).toEqual([70, 150, 220]);
  });

  it("prefers towns with more hotels", () => {
    const stops = cutStages(
      points,
      [town(7), town(8, 12), town(15), town(22)],
      options,
    );
    expect(stops?.[0]?.km).toBe(80);
  });

  it("keeps nearby towns as alternatives", () => {
    const stops = cutStages(
      points,
      [town(7, 3), town(8), town(15), town(22)],
      options,
    );
    expect(stops?.[0]?.alternatives.map((a) => a.km)).toEqual([80]);
  });

  it("avoids stages that climb too much", () => {
    // Flat for 100 km, then 10 m per km.
    const hilly = points.map((p) => ({
      ...p,
      ascent: Math.max(0, p.km - 100) * 10,
    }));
    const towns = [town(15), town(20)];
    const o = { days: 2, kmPerDay: 150, maxAscentPerDay: 5000 };
    expect(cutStages(hilly, towns, o)?.[0]?.km).toBe(150);
    expect(
      cutStages(hilly, towns, { ...o, maxAscentPerDay: 1000 })?.[0]?.km,
    ).toBe(200);
  });

  it("fails when every cut climbs too much", () => {
    const towns = [5, 7, 8, 10, 15, 16, 22, 23].map((i) => town(i));
    expect(
      cutStages(points, towns, { ...options, maxAscentPerDay: 700 }),
    ).toBeNull();
  });

  it("fails without towns", () => {
    expect(cutStages(points, [], options)).toBeNull();
  });

  it("needs no stops for one day", () => {
    expect(cutStages(points, [], { ...options, days: 1 })).toEqual([]);
  });
});

describe("removeSpurs", () => {
  it("drops out-and-back steps", () => {
    expect(
      removeSpurs([
        { edge: 1, forward: true },
        { edge: 2, forward: true },
        { edge: 3, forward: true },
        { edge: 3, forward: false },
        { edge: 2, forward: false },
        { edge: 4, forward: true },
      ]),
    ).toEqual([
      { edge: 1, forward: true },
      { edge: 4, forward: true },
    ]);
  });
});
