import {
  distanceKm,
  type LonLat,
  parseTrip,
  type Proposal,
  type Stage,
} from "@wayline/domain";
import { straightLeg } from "@wayline/planner";
import { describe, expect, it } from "vitest";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import { setStageRoute } from "./edits";
import {
  differentWays,
  otherWaysRequest,
  routeWay,
  viasAlong,
} from "./otherWays";

const trip = parseTrip(sample);
const stage = trip.stages[0]!;
const meta = { provider: "test", profileHash: "touring" };
const route = async (points: LonLat[]) =>
  points.slice(1).map((to, i) => straightLeg(points[i]!, to, meta));

/** A proposal riding the stage's ends through the points. */
async function proposal(id: string, through: LonLat[]): Promise<Proposal> {
  const legs = await route([stage.start.coord, ...through, stage.end.coord]);
  const day: Stage = { ...stage, via: [], legs };
  return {
    id,
    trip: { ...trip, stages: [day] },
    score: 1,
    routeNames: [],
    via: ["Somewhere"],
    character: "scenic",
  };
}

const [a, b] = [stage.start.coord, stage.end.coord];
const mid: LonLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const away: LonLat = [mid[0], mid[1] + 0.3];

describe("otherWaysRequest", () => {
  it("asks for one day from the start to the stop, without stations", () => {
    const r = otherWaysRequest(trip, stage);
    expect(r).toMatchObject({ kind: "one-way", days: 1 });
    expect(r.startStation?.coord).toEqual(stage.start.coord);
    expect(r.endStation?.coord).toEqual(stage.end.coord);
    expect(r.endStation).not.toHaveProperty("station");
  });
});

describe("differentWays", () => {
  it("drops ways in the corridor of the current route", async () => {
    const own = { ...stage, legs: await route([a, mid, b]) };
    const same = await proposal("same", [mid]);
    const other = await proposal("other", [away]);
    expect(differentWays(own, [same, other]).map((p) => p.id)).toEqual([
      "other",
    ]);
  });

  it("drops ways in the corridor of a kept one", async () => {
    const own = { ...stage, legs: await route([a, mid, b]) };
    const first = await proposal("first", [away]);
    const twin = await proposal("twin", [away]);
    expect(differentWays(own, [first, twin]).map((p) => p.id)).toEqual([
      "first",
    ]);
  });
});

describe("viasAlong", () => {
  it("puts three via points along the route, away from the ends", async () => {
    const vias = viasAlong(await route([a, b]));
    expect(vias).toHaveLength(3);
    for (const v of vias) {
      expect(v.kind).toBe("custom");
      expect(distanceKm(v.coord, a)).toBeGreaterThan(1);
      expect(distanceKm(v.coord, b)).toBeGreaterThan(1);
    }
  });
});

describe("routeWay", () => {
  it("routes from the stage's own ends through the via points", async () => {
    const way = await routeWay(stage, await proposal("p", [away]), route);
    expect(way!.route.legs).toHaveLength(4);
    expect(way!.route.via).toHaveLength(3);
    expect(way!.line[0]).toEqual(stage.start.coord);
    expect(way!.line.at(-1)).toEqual(stage.end.coord);
    expect(way!.character).toBe("scenic");
  });

  it("gives a route setStageRoute keeps the stop and hotel for", async () => {
    const way = await routeWay(stage, await proposal("p", [away]), route);
    const next = setStageRoute(trip, 0, way!.route);
    const day = next.stages[0]!;
    expect(day.end).toEqual(stage.end);
    expect(day.hotel).toEqual(stage.hotel);
    expect(day.stats.distance).toBe(way!.route.stats.distance);
    expect(next.stages[1]).toBe(trip.stages[1]);
  });
});
