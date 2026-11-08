import { describe, expect, it } from "vitest";
import { byFit, type Fit } from "./order";

describe("byFit", () => {
  const sort = (fits: (Fit & { id: string })[]) =>
    [...fits].sort(byFit(210)).map((f) => f.id);

  it("puts the closest length first", () => {
    expect(
      sort([
        { id: "long", km: 264, quality: 9 },
        { id: "fit", km: 215, quality: 5 },
      ]),
    ).toEqual(["fit", "long"]);
  });

  it("puts weak stops down when the length fits as well", () => {
    expect(
      sort([
        { id: "weak", km: 212, weak: 1, quality: 9 },
        { id: "beds", km: 225, quality: 5 },
      ]),
    ).toEqual(["beds", "weak"]);
  });

  it("then prefers the better route", () => {
    expect(
      sort([
        { id: "plain", km: 205, quality: 5 },
        { id: "good", km: 220, quality: 8 },
      ]),
    ).toEqual(["good", "plain"]);
  });
});
