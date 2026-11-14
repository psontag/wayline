import type { Place } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { areaRequests } from "./areaTrips";
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
