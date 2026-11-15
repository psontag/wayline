import {
  type LonLat,
  parseTrip,
  type Proposal,
  type Stage,
} from "@wayline/domain";
import { straightLeg } from "@wayline/planner";
import { describe, expect, it } from "vitest";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import { routedStageIfEnding, takeChoice } from "./edits";
import { differentWays, otherWaysRequest, wayOf } from "./otherWays";

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
    expect(r).toMatchObject({ kind: "one-way", days: 1, exactEnds: true });
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

describe("wayOf", () => {
  it("rides the proposal's legs between the stage's own ends, without via points", async () => {
    const p = await proposal("p", [away]);
    const way = wayOf({ ...stage, via: [stage.start] }, p)!;
    expect(way.stage.legs).toBe(p.trip.stages[0]!.legs);
    expect(way.stage.via).toEqual([]);
    expect(way.stage.start).toEqual(stage.start);
    expect(way.stage.end).toEqual(stage.end);
    expect(way.character).toBe("scenic");
  });
});

describe("takeChoice", () => {
  const noHotel = async () => undefined;

  it("rides another way to the same stop: hotel and next day stay", async () => {
    const way = wayOf(stage, await proposal("p", [away]))!;
    const next = await takeChoice(trip, 0, { stage: way.stage }, noHotel);
    expect(next.stages[0]!.legs).toBe(way.stage.legs);
    expect(next.stages[0]!.hotel).toEqual(stage.hotel);
    expect(next.stages[1]).toBe(trip.stages[1]);
  });

  it("ends at another stop: writes both days and looks up a hotel", async () => {
    const place = stage.end.alternatives[0]!;
    const routed = await routedStageIfEnding(trip, 0, place, route);
    const hotel = { osmId: "n1", name: "Hotel", coord: place.coord };
    const next = await takeChoice(trip, 0, routed.stages, async () => hotel);
    expect(next.stages[0]!.end.name).toBe(place.name);
    expect(next.stages[0]!.hotel).toEqual(hotel);
    expect(next.stages[1]!.start.name).toBe(place.name);
    expect(next.stages[0]!.stats.distance).toBe(routed.distance);
  });

  it("takes back a way picked before", async () => {
    const way = wayOf(stage, await proposal("p", [away]))!;
    const there = await takeChoice(trip, 0, { stage: way.stage }, noHotel);
    const back = await takeChoice(there, 0, { stage }, noHotel);
    expect(back.stages[0]!.legs).toBe(stage.legs);
    expect(back.stages[0]!.hotel).toEqual(stage.hotel);
  });
});
