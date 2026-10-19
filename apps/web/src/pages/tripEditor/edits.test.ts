import { type LonLat, parseTrip } from "@wayline/domain";
import { straightLeg } from "@wayline/planner";
import { describe, expect, it } from "vitest";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import { distanceIfEndingAt, moveStop, setLocked } from "./edits";

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
  it("moves the stop, locks it and routes both stages again", async () => {
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
    expect(second!.stats.distance).toBe(second!.legs[0]!.distance);
    expect(next.stages[2]).toBe(trip.stages[2]);
  });
});

describe("setLocked", () => {
  it("changes only the given stop", () => {
    const next = setLocked(trip, 1, true);
    expect(next.stages[1]!.end.locked).toBe(true);
    expect(next.stages[0]).toBe(trip.stages[0]);
  });
});

describe("distanceIfEndingAt", () => {
  it("is close to the stage length for the current stop", () => {
    const stage = trip.stages[0]!;
    const km = distanceIfEndingAt(stage, trip.stages[1], stage.end.coord);
    expect(Math.abs(km - stage.stats.distance)).toBeLessThan(2000);
  });
});
