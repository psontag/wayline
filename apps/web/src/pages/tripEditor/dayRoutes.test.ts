import {
  type LonLat,
  parseTrip,
  type Place,
  type Proposal,
  type Stage,
} from "@wayline/domain";
import { straightLeg } from "@wayline/planner";
import { describe, expect, it } from "vitest";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import { differentRoutes, dayRoutesRequest, routeOf } from "./dayRoutes";
import { routedStageIfEnding, takeChoice } from "./edits";

const trip = parseTrip(sample);
const stage = trip.stages[0]!;
const next = trip.stages[1]!;
const meta = { provider: "test", profileHash: "touring" };
const route = async (points: LonLat[]) =>
  points.slice(1).map((to, i) => straightLeg(points[i]!, to, meta));

const [a, b] = [stage.start.coord, stage.end.coord];
const mid: LonLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const away: LonLat = [mid[0], mid[1] + 0.3];
const town: Place = { name: "Elsewhere", kind: "town", coord: away };
const hotel = { osmId: "n1", name: "Hotel", coord: away };

/** A proposal riding from the stage's start through the points to `end`. */
async function proposal(
  id: string,
  through: LonLat[],
  end: Place = stage.end,
): Promise<Proposal> {
  const legs = await route([stage.start.coord, ...through, end.coord]);
  const day: Stage = {
    ...stage,
    end: { ...end, locked: false, alternatives: [] },
    via: [],
    legs,
    ...(end === stage.end ? {} : { hotel }),
  };
  const on: Stage = {
    ...next,
    start: end,
    via: [],
    legs: await route([end.coord, next.end.coord]),
  };
  return {
    id,
    trip: { ...trip, stages: [day, on] },
    score: 1,
    routeNames: [],
    via: ["Somewhere"],
    flavour: "nature",
  };
}

describe("dayRoutesRequest", () => {
  it("asks for one day to towns with tomorrow's stop in reach", () => {
    const r = dayRoutesRequest(trip, 0);
    expect(r).toMatchObject({ kind: "one-way", days: 1, exactEnds: true });
    expect(r.startStation?.coord).toEqual(stage.start.coord);
    expect(r.endStation).toBeUndefined();
    expect(r.kmPerDay).toBe(stage.stats.distance / 1000);
    expect(r.nextStop?.place.coord).toEqual(next.end.coord);
    expect(r.nextStop?.maxKm).toBeGreaterThan(next.stats.distance / 1000);
  });

  it("keeps the end on the last day", () => {
    const last = trip.stages.length - 1;
    const r = dayRoutesRequest(trip, last);
    expect(r.endStation?.coord).toEqual(trip.stages[last]!.end.coord);
    expect(r.nextStop).toBeUndefined();
  });
});

describe("differentRoutes", () => {
  it("drops routes in the corridor of the current route", async () => {
    const own = { ...stage, legs: await route([a, mid, b]) };
    const same = await proposal("same", [mid]);
    const other = await proposal("other", [away]);
    expect(differentRoutes(own, [same, other]).map((p) => p.id)).toEqual([
      "other",
    ]);
  });

  it("drops routes in the corridor of a kept one", async () => {
    const own = { ...stage, legs: await route([a, mid, b]) };
    const first = await proposal("first", [away]);
    const twin = await proposal("twin", [away]);
    expect(differentRoutes(own, [first, twin]).map((p) => p.id)).toEqual([
      "first",
    ]);
  });
});

describe("routeOf", () => {
  it("to the same stop: the proposal's legs, no via points, tomorrow stays", async () => {
    const withVia = {
      ...trip,
      stages: [{ ...stage, via: [stage.start] }, ...trip.stages.slice(1)],
    };
    const p = await proposal("p", [away]);
    const r = routeOf(withVia, 0, p)!;
    expect(r.stages.stage.legs).toBe(p.trip.stages[0]!.legs);
    expect(r.stages.stage.via).toEqual([]);
    expect(r.stages.stage.end).toEqual(stage.end);
    expect(r.stages.stage.hotel).toEqual(stage.hotel);
    expect(r.stages.next).toBeUndefined();
    expect(r.flavour).toBe("nature");
  });

  it("to another town: its hotel and the ride on to tomorrow's stop", async () => {
    const p = await proposal("p", [], town);
    const r = routeOf(trip, 0, p)!;
    expect(r.stages.stage.end.name).toBe("Elsewhere");
    expect(r.stages.stage.hotel).toEqual(hotel);
    expect(r.stages.next?.start.name).toBe("Elsewhere");
    expect(r.stages.next?.end).toEqual(next.end);
    expect(r.stages.next?.legs).toBe(p.trip.stages[1]!.legs);
    expect(r.nextLine?.length).toBeGreaterThan(1);
  });
});

describe("takeChoice", () => {
  const noHotel = async () => undefined;

  it("rides another way to the same stop: hotel and next day stay", async () => {
    const r = routeOf(trip, 0, await proposal("p", [away]))!;
    const out = await takeChoice(trip, 0, r.stages, noHotel);
    expect(out.stages[0]!.legs).toBe(r.stages.stage.legs);
    expect(out.stages[0]!.hotel).toEqual(stage.hotel);
    expect(out.stages[1]).toBe(trip.stages[1]);
  });

  it("ends in another town: writes both days with the route's hotel", async () => {
    const r = routeOf(trip, 0, await proposal("p", [], town))!;
    const out = await takeChoice(trip, 0, r.stages, noHotel);
    expect(out.stages[0]!.end.name).toBe("Elsewhere");
    expect(out.stages[0]!.hotel).toEqual(hotel);
    expect(out.stages[1]!.start.name).toBe("Elsewhere");
    expect(out.stages[2]).toBe(trip.stages[2]);
  });

  it("looks up a hotel for a stop without one", async () => {
    const place = stage.end.alternatives[0]!;
    const routed = await routedStageIfEnding(trip, 0, place, route);
    const out = await takeChoice(trip, 0, routed.stages, async () => hotel);
    expect(out.stages[0]!.end.name).toBe(place.name);
    expect(out.stages[0]!.hotel).toEqual(hotel);
  });

  it("takes back the day before", async () => {
    const r = routeOf(trip, 0, await proposal("p", [], town))!;
    const there = await takeChoice(trip, 0, r.stages, noHotel);
    const back = await takeChoice(there, 0, { stage, next }, noHotel);
    expect(back.stages[0]).toEqual(stage);
    expect(back.stages[1]).toEqual(next);
  });
});
