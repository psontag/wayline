import {
  encodeLine,
  type Leg,
  type LonLat,
  parseTrip,
  type Stage,
  type Trip,
} from "@wayline/domain";
import { straightLeg } from "@wayline/planner";
import { describe, expect, it } from "vitest";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import { moveStop } from "./edits";
import {
  insertVia,
  isChanged,
  moveVia,
  removeVia,
  revertStage,
  spurStart,
} from "./routeEdits";

const meta = { provider: "test", profileHash: "touring" };
const at = (lon: number, lat = 49): LonLat => [lon, lat];

function recorder() {
  const calls: LonLat[][] = [];
  const route = async (points: LonLat[]) => {
    calls.push(points);
    return points.slice(1).map((to, i) => straightLeg(points[i]!, to, meta));
  };
  return { calls, route, snap: async (c: LonLat) => c };
}

const stage = (id: string, lons: number[], end: string): Stage => ({
  id,
  start: { name: "S", kind: "town", coord: at(lons[0]!) },
  end: {
    name: end,
    kind: "town",
    coord: at(lons.at(-1)!),
    locked: false,
    alternatives: [],
  },
  via: [],
  legs: lons.slice(1).map((lon, i) => straightLeg(at(lons[i]!), at(lon), meta)),
  stats: parseTrip(sample).stages[0]!.stats,
});

const stages = [
  stage("a", [10, 10.2, 10.4, 10.6], "Mitte"),
  stage("b", [10.6, 10.8, 11, 11.2], "Ende"),
];
const trip: Trip = { ...parseTrip(sample), stages, proposed: stages };

describe("insertVia", () => {
  it("routes only the leg it is on", async () => {
    const tools = recorder();
    const next = await insertVia(trip, 0, 1, at(10.3, 49.05), tools);
    expect(tools.calls).toEqual([[at(10.2), at(10.3, 49.05), at(10.4)]]);
    const [first] = next.stages;
    expect(first!.legs).toHaveLength(4);
    expect(first!.legs[0]).toBe(trip.stages[0]!.legs[0]);
    expect(first!.legs[3]).toBe(trip.stages[0]!.legs[2]);
    expect(first!.via.map((v) => v.coord)).toEqual([at(10.3, 49.05)]);
    const km = (legs: Leg[]) => legs.reduce((sum, l) => sum + l.distance, 0);
    expect(first!.stats.distance).toBeCloseTo(km(first!.legs));
    expect(km(first!.legs)).toBeGreaterThan(km(stages[0]!.legs));
    expect(next.stages[1]).toBe(trip.stages[1]);
  });

  it("snaps the via point to the network", async () => {
    const tools = { ...recorder(), snap: async () => at(10.3, 49.01) };
    const next = await insertVia(trip, 0, 1, at(10.3, 49.05), tools);
    expect(next.stages[0]!.via[0]!.coord).toEqual(at(10.3, 49.01));
  });
});

describe("moveVia and removeVia", () => {
  it("move the via point or take it out again", async () => {
    const tools = recorder();
    const added = await insertVia(trip, 0, 1, at(10.3, 49.05), tools);
    const moved = await moveVia(
      added,
      0,
      at(10.3, 49.05),
      at(10.3, 48.95),
      tools,
    );
    expect(moved.stages[0]!.via.map((v) => v.coord)).toEqual([at(10.3, 48.95)]);
    expect(moved.stages[0]!.legs).toHaveLength(4);
    const removed = await removeVia(moved, 0, at(10.3, 48.95), tools);
    expect(removed.stages[0]!.via).toEqual([]);
    expect(removed.stages[0]!.legs).toHaveLength(3);
    expect(tools.calls.at(-1)).toEqual([at(10.2), at(10.4)]);
  });
});

describe("spurStart", () => {
  const leg = (coords: LonLat[]): Leg => ({
    ...straightLeg(coords[0]!, coords.at(-1)!, meta),
    geometry: encodeLine(coords),
  });

  it("finds where a route rides out and back to a via point", () => {
    const before = leg([at(10), at(10.1), at(10.1, 49.01)]);
    const after = leg([at(10.1, 49.01), at(10.1), at(10.2)]);
    expect(spurStart(before, after)).toEqual(at(10.1));
  });

  it("is undefined when the route goes on", () => {
    const before = leg([at(10), at(10.1)]);
    const after = leg([at(10.1), at(10.2)]);
    expect(spurStart(before, after)).toBeUndefined();
  });
});

describe("revertStage", () => {
  it("puts a changed route back as proposed", async () => {
    const tools = recorder();
    const changed = await insertVia(trip, 0, 1, at(10.3, 49.05), tools);
    expect(isChanged(changed, 0)).toBe(true);
    expect(isChanged(changed, 1)).toBe(false);
    const reverted = await revertStage(changed, 0, tools);
    expect(reverted.stages[0]!.legs).toEqual(stages[0]!.legs);
    expect(isChanged(reverted, 0)).toBe(false);
  });

  it("moves the stop back and the next day follows", async () => {
    const tools = recorder();
    const place = { name: "Neu", kind: "town" as const, coord: at(10.5) };
    const moved = await moveStop(trip, 0, place, {
      route: tools.route,
      nearestHotel: async () => undefined,
    });
    expect(isChanged(moved, 0)).toBe(true);
    const reverted = await revertStage(moved, 0, tools);
    expect(reverted.stages[0]!.end.name).toBe("Mitte");
    expect(reverted.stages[1]!.start.coord).toEqual(at(10.6));
    expect(reverted.stages[1]!.legs).toEqual(stages[1]!.legs);
    expect(isChanged(reverted, 1)).toBe(false);
  });

  it("does nothing without a proposal", async () => {
    const old = { ...trip, proposed: undefined };
    expect(await revertStage(old, 0, recorder())).toBe(old);
    expect(isChanged(old, 0)).toBe(false);
  });
});
