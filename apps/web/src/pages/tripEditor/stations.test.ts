import type { GeoStation, LonLat } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { stationsNear } from "./stations";

const station = (id: string, lon: number, lat: number): GeoStation => ({
  id,
  name: id,
  lon,
  lat,
  nodeId: null,
});

// About 44 km north along 11° E, a point every ~1.1 km.
const route: LonLat[] = Array.from({ length: 41 }, (_, i) => [
  11,
  50 + i * 0.01,
]);

describe("stationsNear", () => {
  it("finds stations close to the route, in route order", () => {
    const found = stationsNear(
      [
        station("late", 11.01, 50.3),
        station("early", 10.99, 50.1),
        station("far", 11.2, 50.2),
      ],
      route,
    );
    expect(found.map((s) => s.id)).toEqual(["early", "late"]);
  });

  it("leaves out stations at the start and the end", () => {
    const found = stationsNear(
      [station("start", 11, 50.001), station("end", 11.001, 50.4)],
      route,
    );
    expect(found).toEqual([]);
  });

  it("returns nothing without a route", () => {
    expect(stationsNear([station("a", 11, 50)], [])).toEqual([]);
  });
});
