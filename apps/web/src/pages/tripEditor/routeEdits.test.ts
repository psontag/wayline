import {
  distanceKm,
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
  nearestLeg,
  previewVia,
  removeVia,
  revertStage,
  spurStart,
} from "./routeEdits";

const meta = { provider: "test", profileHash: "touring" };
const at = (lon: number, lat = 49): LonLat => [lon, lat];

/** A leg along a line through the points. */
function legAlong(line: LonLat[]): Leg {
  const km = line
    .slice(1)
    .reduce((sum, p, i) => sum + distanceKm(line[i]!, p), 0);
  return {
    ...straightLeg(line[0]!, line.at(-1)!, meta),
    geometry: encodeLine(line),
    distance: Math.round(km * 1000),
  };
}

const same = (a: LonLat, b: LonLat) => a[0] === b[0] && a[1] === b[1];

/**
 * Records calls. Routes are straight, or follow one of `lines` that
 * starts and ends at the same points.
 */
function recorder(lines: LonLat[][] = []) {
  const calls: LonLat[][] = [];
  const route = async (points: LonLat[]) => {
    calls.push(points);
    return points.slice(1).map((to, i) => {
      const from = points[i]!;
      const line = lines.find((l) => same(l[0]!, from) && same(l.at(-1)!, to));
      return legAlong(line ?? [from, to]);
    });
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

  // The old route rides S → J → W → E, with W north of E. A via point V
  // south of J → W makes the new route reach W from E, so the old leg
  // W → E rides back the same way.
  const [s, j, w, m, e, v] = [
    at(10),
    at(10.2),
    at(10.4, 49.1),
    at(10.4, 49.05),
    at(10.4),
    at(10.3, 48.95),
  ];
  const loopStage: Stage = {
    ...stage("a", [10, 10.4], "E"),
    legs: [legAlong([s, j]), legAlong([j, w]), legAlong([w, m, e])],
  };
  const loop: Trip = { ...trip, stages: [loopStage] };
  const viaE = [v, e, m, w];

  it("drops a join the route would ride out to and back", async () => {
    const tools = recorder([viaE]);
    const next = await insertVia(loop, 0, 1, v, tools);
    expect(tools.calls).toEqual([
      [j, v, w],
      [j, v, e],
    ]);
    const legs = next.stages[0]!.legs;
    expect(legs[0]).toBe(loopStage.legs[0]);
    expect(legs.map((l) => l.to)).toEqual([j, v, e]);
  });

  it("keeps a via point the route rides out to and back", async () => {
    const tools = recorder([viaE]);
    const kept: Trip = {
      ...loop,
      stages: [{ ...loopStage, via: [{ name: "", kind: "custom", coord: w }] }],
    };
    const next = await insertVia(kept, 0, 1, v, tools);
    expect(tools.calls).toEqual([[j, v, w]]);
    expect(next.stages[0]!.legs.map((l) => l.to)).toEqual([j, v, w, e]);
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

describe("previewVia", () => {
  it("routes a new point on its leg and gives the extra distance", async () => {
    const tools = recorder();
    const preview = await previewVia(
      stages[0]!,
      { leg: 1 },
      at(10.3, 49.05),
      tools,
    );
    expect(tools.calls.at(-1)).toEqual([at(10.2), at(10.3, 49.05), at(10.4)]);
    expect(preview?.line[0]).toEqual(at(10.2));
    expect(preview?.line.at(-1)).toEqual(at(10.4));
    expect(preview?.distance).toBeGreaterThan(0);
  });

  it("routes a moved point between its neighbours", async () => {
    const tools = recorder();
    const withVia = await insertVia(trip, 0, 1, at(10.3, 49.05), tools);
    tools.calls.length = 0;
    const preview = await previewVia(
      withVia.stages[0]!,
      { via: at(10.3, 49.05) },
      at(10.3, 49),
      tools,
    );
    expect(tools.calls.at(-1)).toEqual([at(10.2), at(10.3, 49), at(10.4)]);
    // Back on the straight line: shorter than the detour it replaces.
    expect(preview?.distance).toBeLessThan(0);
  });

  it("gives nothing for a point that is not on the stage", async () => {
    const preview = await previewVia(
      stages[0]!,
      { via: at(12) },
      at(10.3),
      recorder(),
    );
    expect(preview).toBeUndefined();
  });
});

describe("nearestLeg", () => {
  it("picks the leg that passes closest and how far off it is", () => {
    const lines = [
      [at(10), at(10.2)],
      [at(10.2), at(10.4)],
    ];
    const near = nearestLeg(lines, at(10.4, 49.01));
    expect(near?.leg).toBe(1);
    expect(near?.km).toBeCloseTo(1.11, 1);
  });

  it("gives nothing without lines", () => {
    expect(nearestLeg([], at(10))).toBeUndefined();
  });
});
