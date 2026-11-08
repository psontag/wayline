import { describe, expect, it } from "vitest";
import { shortTrip, tripTitle } from "./trip";

describe("shortTrip", () => {
  const wuerzburg: [number, number] = [9.931, 49.793];
  const bamberg: [number, number] = [10.887, 49.892];

  it("says when A to B is much shorter than the planned days", () => {
    // About 70 km apart, so about 90 km by bike.
    expect(shortTrip(wuerzburg, bamberg, 3, 70)).toEqual({
      km: 90,
      days: 2,
      kmPerDay: 30,
    });
  });

  it("says nothing when the days fit", () => {
    expect(shortTrip(wuerzburg, bamberg, 2, 60)).toBeUndefined();
    expect(shortTrip(wuerzburg, bamberg, 1, 120)).toBeUndefined();
  });
});

describe("tripTitle", () => {
  it("names one-way trips by start and end", () => {
    expect(tripTitle("Würzburg", "Bamberg")).toBe("Würzburg – Bamberg");
  });

  it("names loops by their start", () => {
    expect(tripTitle("Heidelberg")).toBe("Loop from Heidelberg");
    expect(tripTitle("Heidelberg", "Heidelberg")).toBe("Loop from Heidelberg");
    expect(tripTitle("Heidelberg", undefined, "Wiesloch")).toBe(
      "Loop from Heidelberg via Wiesloch",
    );
  });
});
