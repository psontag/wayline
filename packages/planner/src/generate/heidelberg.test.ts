import {
  decodeLine,
  distanceKm,
  type GenerateRequest,
  type Leg,
  type LonLat,
  routePoints,
} from "@wayline/domain";
import {
  type RoutingProvider,
  TiledNetworkSource,
  tileKeys,
} from "@wayline/providers";
import { readDataFile } from "@wayline/providers/testing";
import { describe, expect, it } from "vitest";
import { straightLeg } from "../graph/leg";
import { Planners, requestBBox } from "./generate";

// The owner's test: a loop from Heidelberg with two hotel nights.
const request: GenerateRequest = {
  kind: "multi-day-loop",
  startStation: {
    name: "Heidelberg Hauptbahnhof",
    kind: "station",
    coord: [8.67542, 49.40347],
  },
  days: 3,
  kmPerDay: 70,
  maxAscentPerDay: 900,
  profile: "touring",
  hotelBudget: "mid",
  startTime: "09:00",
};

function source() {
  return new TiledNetworkSource(readDataFile, "/data/mock/heidelberg");
}

/** Straight legs, and a log of each call. */
function recordingRouter(): RoutingProvider & { calls: LonLat[][] } {
  const calls: LonLat[][] = [];
  return {
    calls,
    async route(points) {
      calls.push(points);
      const legs: Leg[] = [];
      for (let i = 1; i < points.length; i++) {
        legs.push(
          straightLeg(points[i - 1]!, points[i]!, {
            provider: "test",
            profileHash: "x",
          }),
        );
      }
      return legs;
    },
  };
}

describe("Planner on the Heidelberg tiles", () => {
  it("loads only the tiles around the start", async () => {
    const { tiles } = await source().manifest();
    expect(tileKeys(tiles!, requestBBox(request)).length).toBeGreaterThan(1);
    const short = { ...request, kmPerDay: 5 };
    expect(tileKeys(tiles!, requestBBox(short))).toEqual(["17_98"]);
  });

  it("plans a 3-day loop with two hotel stops", async () => {
    const places = await source().places();
    const t = performance.now();
    const planner = await new Planners(source()).for(request);
    const loaded = performance.now();
    const result = await planner.generate(request);
    console.log(
      `Heidelberg: load ${Math.round(loaded - t)} ms, ` +
        `generate ${Math.round(performance.now() - loaded)} ms`,
    );
    if (!result.ok) throw new Error(result.failedLimit);
    expect(result.proposals.length).toBeGreaterThanOrEqual(2);

    const hotels = new Map(places.towns.map((t) => [t.id, t.hotelCount]));
    for (const p of result.proposals) {
      const { stages } = p.trip;
      expect(stages).toHaveLength(3);
      expect(stages[0]!.start.name).toBe("Heidelberg Hauptbahnhof");
      expect(stages[2]!.end.name).toBe("Heidelberg Hauptbahnhof");
      expect(p.via).not.toContain("Heidelberg");
      for (const stop of [stages[0]!, stages[1]!]) {
        expect(stop.hotel).toBeDefined();
        expect(hotels.get(stop.end.osmId ?? "")).toBeGreaterThan(0);
      }

      // A real loop: stops away from the start, days near the target, and
      // the middle does not pass the start.
      const home = request.startStation!.coord;
      for (const stop of [stages[0]!, stages[1]!]) {
        expect(distanceKm(home, stop.end.coord)).toBeGreaterThan(15);
      }
      for (const s of stages) {
        expect(s.stats.distance / 1000).toBeGreaterThan(0.5 * 70);
        expect(s.stats.distance / 1000).toBeLessThan(1.35 * 70);
      }
      const line = routePoints(stages.flatMap((s) => s.legs));
      const total = line.at(-1)!.km;
      const middle = line.filter(
        (q) => q.km > 0.2 * total && q.km < 0.8 * total,
      );
      for (const q of middle) {
        expect(distanceKm(home, q.coord)).toBeGreaterThan(5);
      }
      console.log(
        `${p.trip.name}: ` +
          stages.map((s) => Math.round(s.stats.distance / 1000)).join(" + ") +
          " km",
      );
    }
  });

  it("routes each proposal in one call through graph nodes", async () => {
    const router = recordingRouter();
    const planner = await new Planners(source()).for(request);
    const result = await planner.generate(request, { routing: router });
    if (!result.ok) throw new Error(result.failedLimit);
    expect(router.calls).toHaveLength(result.proposals.length);

    for (const [i, p] of result.proposals.entries()) {
      const points = router.calls[i]!;
      expect(points[0]).toEqual(request.startStation!.coord);
      // Waypoints are about 10 km apart along the path.
      for (let j = 1; j < points.length; j++) {
        expect(distanceKm(points[j - 1]!, points[j]!)).toBeLessThan(40);
      }
      const legs = p.trip.stages.flatMap((s) => s.legs);
      expect(legs).toHaveLength(points.length - 1);
      expect(legs.every((l) => l.provider === "test")).toBe(true);
      for (const s of p.trip.stages) {
        const line = s.legs.flatMap((l) => decodeLine(l.geometry));
        expect(line[0]).toEqual(s.start.coord);
        expect(line.at(-1)).toEqual(s.end.coord);
      }
    }
  });

  it("keeps the graph path when routing fails", async () => {
    const planner = await new Planners(source()).for(request);
    const result = await planner.generate(request, {
      routing: {
        route: () => Promise.reject(new Error("router down")),
      },
    });
    if (!result.ok) throw new Error(result.failedLimit);
    const legs = result.proposals.flatMap((p) =>
      p.trip.stages.flatMap((s) => s.legs),
    );
    expect(legs.every((l) => l.provider === "graph")).toBe(true);
  });

  it("makes a late first day shorter", async () => {
    const late = { ...request, dayShares: [0.5, 1, 1], startTime: "13:00" };
    const planner = await new Planners(source()).for(late);
    const result = await planner.generate(late);
    if (!result.ok) throw new Error(result.failedLimit);
    for (const p of result.proposals) {
      const [first, second] = p.trip.stages.map((s) => s.stats.distance / 1000);
      expect(first).toBeLessThan(0.7 * 70);
      expect(first).toBeLessThan(second!);
      expect(p.trip.settings.dayShares).toEqual([0.5, 1, 1]);
    }
  });

  it("plans day loops", async () => {
    const loop: GenerateRequest = {
      ...request,
      kind: "day-loop",
      days: 1,
      kmPerDay: 60,
    };
    const planner = await new Planners(source()).for(loop);
    const result = await planner.generate(loop);
    if (!result.ok) throw new Error(result.failedLimit);
    for (const p of result.proposals) {
      expect(p.trip.stages).toHaveLength(1);
      const [stage] = p.trip.stages;
      expect(stage!.start.name).toBe(stage!.end.name);
      expect(stage!.hotel).toBeUndefined();
      expect(stage!.stats.distance / 1000).toBeGreaterThan(45);
      expect(stage!.stats.distance / 1000).toBeLessThan(75);
      expect(p.trip.name).toContain(" – ");
    }
  });

  it("plans one day from a town to a town with characters", async () => {
    const ride: GenerateRequest = {
      ...request,
      kind: "one-way",
      days: 1,
      kmPerDay: 60,
      startStation: {
        name: "Heidelberg",
        kind: "town",
        coord: [8.69472, 49.40936],
      },
      endStation: {
        name: "Weinheim",
        kind: "town",
        coord: [8.67175, 49.54624],
      },
    };
    const planner = await new Planners(source()).for(ride);
    const result = await planner.generate(ride);
    if (!result.ok) throw new Error(result.failedLimit);
    const [direct, ...others] = result.proposals;
    expect(direct!.character).toBe("direct");
    expect(others.every((p) => p.character !== "direct")).toBe(true);
    const km = (p: typeof direct) => p!.trip.stages[0]!.stats.distance;
    for (const p of others) expect(km(p)).toBeGreaterThan(km(direct));
    expect(others.length).toBeGreaterThan(0);
    // Weinheim has a station within 2 km.
    expect(direct!.trip.stages[0]!.end.kind).toBe("station");
    // The name keeps the towns the user picked.
    expect(direct!.trip.name).toBe("Heidelberg – Weinheim");
  });
});
