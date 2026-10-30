import { type LonLat, parseTrip, type Stage, type Trip } from "@wayline/domain";
import { straightLeg } from "@wayline/planner";
import { describe, expect, it } from "vitest";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import {
  ascentAlong,
  moveStop,
  routedStageIfEnding,
  setLocked,
  stageIfEndingAt,
} from "./edits";

const trip = parseTrip(sample);
const meta = { provider: "test", profileHash: "touring" };
const route = async (points: LonLat[]) =>
  points.slice(1).map((to, i) => straightLeg(points[i]!, to, meta));
const hotel = {
  osmId: "n1",
  name: "Hotel Test",
  coord: [11.5, 49.9] as LonLat,
};

describe("moveStop", () => {
  it("moves the stop, locks it and routes the stages around it", async () => {
    const place = trip.stages[0]!.end.alternatives[0]!;
    const next = await moveStop(trip, 0, place, {
      route,
      nearestHotel: async () => hotel,
    });
    const [first, second] = next.stages;
    expect(first!.end.name).toBe(place.name);
    expect(first!.end.locked).toBe(true);
    expect(first!.end.alternatives.map((a) => a.name)).toContain("Bayreuth");
    expect(first!.end.alternatives.map((a) => a.name)).not.toContain(
      place.name,
    );
    expect(first!.hotel).toEqual(hotel);
    expect(first!.legs[0]!.provider).toBe("test");
    expect(second!.start.coord).toEqual(place.coord);
    expect(second!.stats.distance).toBeCloseTo(
      second!.legs.reduce((km, l) => km + l.distance, 0),
    );
    expect(next.stages[2]).toBe(trip.stages[2]);
  });
});

describe("routedStageIfEnding", () => {
  it("gives the km the stage has after picking the place", async () => {
    const place = trip.stages[0]!.end.alternatives[0]!;
    const choice = await routedStageIfEnding(trip, 0, place, route);
    const next = await moveStop(trip, 0, place, {
      route,
      nearestHotel: async () => hotel,
    });
    expect(choice).toEqual({
      distance: next.stages[0]!.stats.distance,
      ascent: next.stages[0]!.stats.ascent,
      nextDistance: next.stages[1]!.stats.distance,
    });
  });
});

describe("moveStop on a planned route", () => {
  // Two days east along the 49th parallel, three legs each.
  const at = (lon: number): LonLat => [lon, 49];
  const stage = (id: string, lons: number[], end: string): Stage => ({
    id,
    start: { name: "S", kind: "town" as const, coord: at(lons[0]!) },
    end: {
      name: end,
      kind: "town" as const,
      coord: at(lons.at(-1)!),
      locked: false,
      alternatives: [],
    },
    via: [],
    legs: lons
      .slice(1)
      .map((lon, i) => straightLeg(at(lons[i]!), at(lon), meta)),
    stats: trip.stages[0]!.stats,
  });
  const planned: Trip = {
    ...trip,
    stages: [
      stage("a", [10, 10.2, 10.4, 10.6], "Mitte"),
      stage("b", [10.6, 10.8, 11, 11.2], "Ende"),
    ],
  };

  it("keeps the route and routes only the leg at the new stop", async () => {
    const calls: LonLat[][] = [];
    const place = { name: "Neu", kind: "town" as const, coord: at(10.5) };
    const next = await moveStop(planned, 0, place, {
      route: async (points) => {
        calls.push(points);
        return route(points);
      },
      nearestHotel: async () => hotel,
    });
    expect(calls).toEqual([[at(10.4), at(10.5), at(10.6)]]);
    const [first, second] = next.stages;
    expect(first!.legs.slice(0, 2)).toEqual(
      planned.stages[0]!.legs.slice(0, 2),
    );
    expect(first!.legs.at(-1)!.to).toEqual(at(10.5));
    expect(second!.start.name).toBe("Neu");
    expect(second!.legs.slice(1)).toEqual(planned.stages[1]!.legs);
    // The whole trip is as long as before.
    const km = (t: Trip) =>
      t.stages.reduce(
        (sum, s) => sum + s.legs.reduce((a, l) => a + l.distance, 0),
        0,
      );
    expect(Math.abs(km(next) - km(planned))).toBeLessThan(10);
  });
});

describe("setLocked", () => {
  it("changes only the given stop", () => {
    const next = setLocked(trip, 1, true);
    expect(next.stages[1]!.end.locked).toBe(true);
    expect(next.stages[0]).toBe(trip.stages[0]);
  });
});

describe("stageIfEndingAt", () => {
  const [stage, next] = trip.stages;

  it("matches the stage for the current stop", () => {
    const at = stageIfEndingAt(stage!, next, stage!.end.coord);
    expect(Math.abs(at.distance - stage!.stats.distance)).toBeLessThan(2000);
    expect(Math.abs(at.ascent - stage!.stats.ascent)).toBeLessThan(30);
    expect(Math.abs(at.nextDistance! - next!.stats.distance)).toBeLessThan(
      2000,
    );
  });

  it("moves km and ascent between today and tomorrow", () => {
    const place = stage!.end.alternatives[0]!;
    const at = stageIfEndingAt(stage!, next, place.coord);
    const both = stage!.stats.distance + next!.stats.distance;
    // The way off the route counts twice.
    expect(at.distance + at.nextDistance!).toBeGreaterThanOrEqual(both - 2000);
    expect(at.ascent).toBeLessThanOrEqual(
      stage!.stats.ascent + next!.stats.ascent,
    );
    expect(at.distance > stage!.stats.distance).toBe(
      at.ascent >= stage!.stats.ascent,
    );
  });

  it("has no next stage on the last day", () => {
    const last = trip.stages.at(-1)!;
    expect(stageIfEndingAt(last, undefined, last.end.coord).nextDistance).toBe(
      undefined,
    );
  });
});

describe("ascentAlong", () => {
  const point = (km: number, ele: number) => ({
    coord: [0, 0] as LonLat,
    km,
    ele,
  });

  it("ignores small ups and downs and ends at the stage ascent", () => {
    const points = [
      point(0, 100),
      point(1, 102),
      point(2, 100),
      point(3, 150),
      point(4, 140),
      point(5, 190),
    ];
    expect(ascentAlong(points, 50)).toEqual([0, 0, 0, 25, 25, 50]);
  });

  it("spreads the ascent over the km on a flat profile", () => {
    expect(ascentAlong([point(0, 100), point(2, 100)], 10)).toEqual([0, 10]);
  });
});
