import type { Place } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { areaRegion, areaRequests, spreadStarts } from "./areaTrips";
import { defaultValues } from "./form";

const station = (name: string, lon: number): Place => ({
  name,
  kind: "station",
  coord: [lon, 49],
  osmId: name,
});
const stations = [station("A", 8), station("B", 8.1), station("C", 8.2)];
const values = defaultValues("2026-11-14");

describe("areaRequests", () => {
  it("tries the three fastest stations with one shape", () => {
    const requests = areaRequests(values, stations, undefined, "loop");
    expect(requests.map((r) => r.startStation?.name)).toEqual(["A", "B", "C"]);
    expect(requests.every((r) => r.kind === "multi-day-loop")).toBe(true);
  });

  it("tries a loop and a one way trip from two stations with Any", () => {
    const requests = areaRequests(values, stations, undefined, "any");
    expect(requests.map((r) => [r.startStation?.name, r.kind])).toEqual([
      ["A", "multi-day-loop"],
      ["A", "one-way"],
      ["B", "multi-day-loop"],
      ["B", "one-way"],
    ]);
    expect(requests[1]?.endStation).toBeUndefined();
  });

  it("uses only the picked station", () => {
    const requests = areaRequests(values, stations, stations[2], "oneWay");
    expect(requests.map((r) => r.startStation?.name)).toEqual(["C"]);
  });

  it("makes a one day one way trip an open ride", () => {
    const one = { ...values, length: "one" as const };
    const [request] = areaRequests(one, stations, stations[0], "oneWay");
    expect(request?.kind).toBe("one-way");
    expect(request?.days).toBe(1);
  });
});

describe("spreadStarts", () => {
  it("skips stations close to one already taken", () => {
    const near = [
      station("Hbf", 8.4),
      station("West", 8.45),
      station("Far", 8.8),
      station("Farther", 9.2),
    ];
    expect(spreadStarts(near, 3).map((s) => s.name)).toEqual([
      "Hbf",
      "Far",
      "Farther",
    ]);
  });

  it("falls back to close stations when too few are apart", () => {
    const near = [station("Hbf", 8.4), station("West", 8.45)];
    expect(spreadStarts(near, 2).map((s) => s.name)).toEqual(["Hbf", "West"]);
  });
});

describe("areaRegion", () => {
  const [request] = areaRequests(values, stations, stations[0], "loop");

  it("adds a margin around an area big enough for the trip", () => {
    const [w, s, e, n] = areaRegion([8, 48, 9.5, 49.2], request!);
    expect((8 - w) * 111.2 * Math.cos((48.6 * Math.PI) / 180)).toBeCloseTo(
      10,
      0,
    );
    expect((48 - s) * 111.2).toBeCloseTo(10, 0);
    expect((n - 49.2) * 111.2).toBeCloseTo(10, 0);
    expect(e).toBeGreaterThan(9.5);
  });

  it("grows a small area to fit the trip", () => {
    const [w, s, e, n] = areaRegion([8.4, 48.9, 8.5, 49], request!);
    // A loop of 210 km needs about 70 km across.
    expect((n - s) * 111.2).toBeGreaterThanOrEqual(70);
    expect((e - w) * 111.2 * Math.cos((49 * Math.PI) / 180)).toBeGreaterThan(
      70,
    );
  });

  it("is set on area requests with a bbox", () => {
    const bbox: [number, number, number, number] = [8, 48, 9, 49];
    const [r] = areaRequests(values, stations, undefined, "loop", bbox);
    expect(r?.region).toBeDefined();
  });
});
