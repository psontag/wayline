import { encodeLine, type Leg, type LonLat } from "@wayline/domain";
import { straightLeg } from "@wayline/planner";
import { describe, expect, it } from "vitest";
import { proposedSection } from "./proposedSection";

const meta = { provider: "test", profileHash: "touring" };

function leg(points: [number, number, number][]): Leg {
  const coords = points.map(([lon, lat]): LonLat => [lon, lat]);
  return {
    ...straightLeg(coords[0]!, coords.at(-1)!, meta),
    geometry: encodeLine(coords),
    elevation: points.map(([, , ele]) => ele),
  };
}

describe("proposedSection", () => {
  const proposed = leg([
    [10, 49, 100],
    [10.1, 49, 110],
    [10.2, 49, 120],
    [10.3, 49, 130],
  ]);

  it("is undefined for the same route", () => {
    expect(proposedSection([proposed], [proposed])).toBeUndefined();
  });

  it("stretches a detour onto the ridden km", () => {
    // Out north between 10.1 and 10.2, longer than the proposed road.
    const ridden = leg([
      [10, 49, 100],
      [10.1, 49, 110],
      [10.12, 49.05, 200],
      [10.18, 49.05, 210],
      [10.2, 49, 120],
      [10.3, 49, 130],
    ]);
    const section = proposedSection([ridden], [proposed]);
    expect(section).toBeDefined();
    expect(section!.coords).toEqual([
      [10.1, 49],
      [10.2, 49],
    ]);
    expect(section!.points.map((p) => p.ele)).toEqual([110, 120]);
    expect(section!.points[0]!.km).toBeCloseTo(section!.startKm);
    expect(section!.points[1]!.km).toBeCloseTo(section!.endKm);
    expect(section!.endKm - section!.startKm).toBeGreaterThan(7.3);
  });

  it("is undefined when the ridden route only goes further", () => {
    const ridden = leg([
      [10, 49, 100],
      [10.1, 49, 110],
      [10.2, 49, 120],
      [10.3, 49, 130],
      [10.4, 49, 140],
    ]);
    expect(proposedSection([ridden], [proposed])).toBeUndefined();
  });

  it("runs to the end when the stop moved", () => {
    const ridden = leg([
      [10, 49, 100],
      [10.1, 49, 110],
      [10.2, 49, 120],
      [10.25, 49.05, 140],
    ]);
    const section = proposedSection([ridden], [proposed]);
    expect(section!.coords).toEqual([
      [10.2, 49],
      [10.3, 49],
    ]);
  });
});
