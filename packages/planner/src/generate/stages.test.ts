import type { LonLat } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { removeSpurs } from "./search";
import { cutStages, type PathPoint, type StopCandidate } from "./stages";

// A straight 300 km path with a node every 10 km and 10 m ascent per km.
const points: PathPoint[] = Array.from({ length: 31 }, (_, i) => ({
  node: i,
  km: i * 10,
  ascent: i * 100,
}));

// Towns on the path, 10 km apart from west to east.
function town(index: number, hotels = 1, offKm = 0): StopCandidate {
  const coord: LonLat = [8 + index * 0.137, 49];
  return { node: 100 + index, coord, index, km: index * 10, offKm, hotels };
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

  it("rejects days far from the target", () => {
    // Only a stop at 230 km: days of 230 and 70 km for a 150 km target.
    const o = { days: 2, kmPerDay: 150, maxAscentPerDay: 5000 };
    expect(cutStages(points, [town(23)], o)).toBeNull();
    expect(cutStages(points, [town(23), town(16)], o)?.[0]?.km).toBe(160);
  });

  it("keeps loop stops away from the start", () => {
    const o = { days: 2, kmPerDay: 150, maxAscentPerDay: 5000 };
    const home = town(14).coord;
    expect(cutStages(points, [town(15)], o)?.[0]?.km).toBe(150);
    expect(cutStages(points, [town(15)], { ...o, home })).toBeNull();
  });

  it("spreads stops apart in a straight line", () => {
    // Town 20 is 100 km after town 10 along the path, but at the same place.
    const same = { ...town(20), coord: town(10).coord };
    const o = { days: 3, kmPerDay: 100, maxAscentPerDay: 5000 };
    expect(cutStages(points, [town(10), town(20)], o)).not.toBeNull();
    expect(cutStages(points, [town(10), same], o)).toBeNull();
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
