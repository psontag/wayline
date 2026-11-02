import { describe, expect, it } from "vitest";
import { type End, spreadEnds } from "./search";

describe("spreadEnds", () => {
  it("keeps the nicest end per direction and distance", () => {
    const ends: End[] = [
      { end: 1, straight: 100, bearing: 2, rate: 3 },
      { end: 2, straight: 110, bearing: 5, rate: 2 },
      { end: 3, straight: 30, bearing: 5, rate: 9 },
      { end: 4, straight: 100, bearing: 180, rate: 5 },
    ];
    expect(spreadEnds(ends, 200).map((e) => e.end)).toEqual([2, 3, 4]);
  });
});
