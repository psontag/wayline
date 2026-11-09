import {
  encodeLine,
  type Place,
  type ReachFile,
  type ReachRow,
  type RoutePart,
  type RouteStationsFile,
} from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { defaultReachFilter } from "./reach";
import { partLine, shelfRoutes } from "./routeShelf";

const direct = (minutes: number): ReachRow => [
  minutes,
  minutes,
  minutes,
  minutes,
  minutes,
  minutes,
  0,
];

// Five stations 50 km apart along a line north. 0.45° is about 50 km.
const ids = ["a", "b", "c", "d", "e"];
const places = new Map<string, Place>(
  [...ids, "x"].map((id, i) => [
    id,
    {
      name: id.toUpperCase(),
      kind: "station",
      coord: [8, 49 + i * 0.45],
      osmId: id,
    } as Place,
  ]),
);
const part = (stations: [string, number][]): RoutePart => ({
  lengthKm: 200,
  ascent: 200,
  scenery: { forest: 0.2, water: 0.8, vineyard: 0, nature: 0, sights: 0.7 },
  bbox: [8, 49, 8, 50.8],
  line: encodeLine([
    [8, 49],
    [8, 50.8],
  ]),
  stations,
});
const file: RouteStationsFile = {
  version: "test",
  routes: [
    {
      name: "Fluss-Radweg",
      network: "rcn",
      parts: [part(ids.map((id, i) => [id, i * 50]))],
    },
    {
      name: "Far-Radweg",
      network: "rcn",
      parts: [part([["x", 0]])],
    },
  ],
};

function reachFile(
  out: Record<string, number>,
  back: Record<string, number>,
): ReachFile {
  const rows = (m: Record<string, number>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, direct(v)]));
  const days = { weekday: {}, saturday: rows(out), sunday: {} };
  return {
    version: "test",
    home: { id: "h", name: "Home" },
    attribution: "",
    dates: { weekday: "", saturday: "", sunday: "" },
    windows: { out: [420, 900], back: [900, 1320] },
    format: "",
    out: days,
    back: { weekday: rows(back), saturday: {}, sunday: {} },
  };
}

// Saturday out, Monday back.
const ask = {
  stations: places,
  filter: defaultReachFilter,
  startDate: "2026-11-14",
  days: 3,
};

describe("shelfRoutes", () => {
  it("picks the stretch of the trip's km with the least train time", () => {
    const reach = reachFile(
      { a: 100, b: 60, c: 90, d: 110, e: 30 },
      { a: 100, b: 100, c: 50, d: 40, e: 30 },
    );
    const [route] = shelfRoutes({ file, reach, ...ask, km: 150 });
    expect(route?.name).toBe("Fluss-Radweg");
    expect(route?.stations).toBe(5);
    expect(route?.reachKm).toBe(200);
    expect(route?.tags).toEqual(["water", "sights", "flat"]);
    // b to e: 60 + 30. Against the flow, e to b: 30 + 100.
    expect(route?.stretch).toMatchObject({
      from: { place: { name: "B" }, km: 50 },
      to: { place: { name: "E" }, km: 200 },
      km: 150,
      trainMinutes: 90,
    });
  });

  it("rides either way along the route", () => {
    const reach = reachFile({ e: 30, a: 100 }, { a: 20, e: 200 });
    const [route] = shelfRoutes({ file, reach, ...ask, km: 200 });
    expect(route?.stretch?.from.place.name).toBe("E");
    expect(route?.stretch?.to.place.name).toBe("A");
  });

  it("keeps routes in reach without a stretch, after those with one", () => {
    // Fluss-Radweg has 50 km in reach, too short for 100 km.
    const reach = reachFile({ a: 60, b: 60, x: 30 }, { a: 60, b: 60, x: 30 });
    const routes = shelfRoutes({ file, reach, ...ask, km: 100 });
    expect(routes.map((r) => r.name)).toEqual(["Fluss-Radweg", "Far-Radweg"]);
    expect(routes.every((r) => !r.stretch)).toBe(true);
    const [first] = shelfRoutes({ file, reach, ...ask, km: 50 });
    expect(first?.stretch?.km).toBe(50);
  });

  it("rides with the wind when the trains take about as long", () => {
    // a to e: 60 + 50. e to a: 50 + 75, 15 min more.
    const reach = reachFile({ a: 60, e: 50 }, { a: 75, e: 50 });
    // The line runs north. Wind from the north: south is tailwind.
    const wind = (line: [number, number][]) =>
      (line.at(-1)?.[1] ?? 0) > (line[0]?.[1] ?? 0) ? 1 : -1;
    const [plain] = shelfRoutes({ file, reach, ...ask, km: 200 });
    expect(plain?.stretch?.from.place.name).toBe("A");
    const [windy] = shelfRoutes({ file, reach, ...ask, km: 200, wind });
    expect(windy?.stretch?.from.place.name).toBe("E");
  });

  it("keeps the faster trains when the wind way is much slower", () => {
    const reach = reachFile({ a: 60, e: 50 }, { a: 120, e: 50 });
    const wind = (line: [number, number][]) =>
      (line.at(-1)?.[1] ?? 0) > (line[0]?.[1] ?? 0) ? 1 : -1;
    const [route] = shelfRoutes({ file, reach, ...ask, km: 200, wind });
    expect(route?.stretch?.from.place.name).toBe("A");
  });

  it("leaves out stations over the max train time", () => {
    const reach = reachFile({ a: 200, b: 60 }, { a: 200, b: 60 });
    const [route] = shelfRoutes({ file, reach, ...ask, km: 50 });
    expect(route?.stations).toBe(1);
    expect(route?.stretch).toBeUndefined();
  });
});

describe("partLine", () => {
  it("cuts the line between two km, in the direction of travel", () => {
    const line = partLine(file.routes[0]!.parts[0]!, 150, 50);
    expect(line[0]![1]).toBeCloseTo(50.35, 1);
    expect(line.at(-1)![1]).toBeCloseTo(49.45, 1);
  });
});
