import type { GenerateRequest, RoutePoint } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { labelPoints, progressValue, relaxOptions } from "./proposalView";

const request: GenerateRequest = {
  kind: "one-way",
  startStation: { name: "Bamberg", kind: "station", coord: [10.9, 49.9] },
  days: 3,
  kmPerDay: 70,
  maxAscentPerDay: 900,
  profile: "touring",
  hotelBudget: "mid",
  startTime: "09:00",
};

/** Straight line north from lon, about 11 km per 0.1°. */
function line(lon: number): RoutePoint[] {
  return Array.from({ length: 21 }, (_, i) => ({
    coord: [lon, 50 + i * 0.01],
    ele: 300,
    km: i * 1.11,
  }));
}

describe("relaxOptions", () => {
  it("offers more ascent first when stages are too steep", () => {
    const [first, second] = relaxOptions(request, "maxAscentPerDay");
    expect(first).toMatchObject({
      change: "maxAscentPerDay",
      value: 1150,
      request: { maxAscentPerDay: 1150 },
    });
    expect(second).toMatchObject({ change: "kmPerDay", value: 55 });
  });

  it("drops the hotel budget when hotels are missing", () => {
    const [first] = relaxOptions(request, "hotels");
    expect(first?.change).toBe("anyBudget");
    expect(first?.request.hotelBudget).toBeUndefined();
  });

  it("offers nothing for a start outside the network", () => {
    expect(relaxOptions(request, "area")).toEqual([]);
  });
});

describe("labelPoints", () => {
  it("puts each number away from the other routes", () => {
    const shared = line(11);
    const [a, b] = labelPoints([
      shared,
      [...shared.slice(0, 5), ...line(11.2).slice(5)],
    ]);
    expect(a?.[0]).toBe(11);
    expect(b?.[0]).toBe(11.2);
  });
});

describe("progressValue", () => {
  it("grows through the phases", () => {
    const values = [
      progressValue({ phase: "loading", done: 0, total: 0 }),
      progressValue({ phase: "searching", done: 150, total: 300 }),
      progressValue({ phase: "cutting", done: 5, total: 5 }),
      progressValue({ phase: "routing", done: 5, total: 5 }),
    ];
    expect(values).toEqual([...values].sort((x, y) => x - y));
    expect(values.at(-1)).toBe(1);
  });
});
