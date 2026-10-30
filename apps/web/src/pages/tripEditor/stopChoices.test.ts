import { parseTrip, type Places } from "@wayline/domain";
import { fitsBudget } from "@wayline/providers";
import { describe, expect, it } from "vitest";
import places from "../../../public/data/mock/oberfranken/places.json";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import {
  bedsNear,
  placeIndex,
  routeNear,
  stopChoices,
  stopHotels,
  townSize,
} from "./stopChoices";

const trip = parseTrip(sample);
const index = placeIndex(places as Places);
const [stage, next] = trip.stages;

describe("stopChoices", () => {
  it("lists the stop and its alternatives with context, shortest first", () => {
    const choices = stopChoices(trip, 0, index);
    expect(choices).toHaveLength(3);
    expect(choices.map((c) => c.distance)).toEqual(
      choices.map((c) => c.distance).sort((a, b) => a - b),
    );
    const current = choices.find((c) => c.current)!;
    expect(current.place.name).toBe("Bayreuth");
    expect(current.ascent).toBe(stage!.stats.ascent);
    expect(current.nextDistance).toBe(next!.stats.distance);
    expect(current.size).toBe("town");
    expect(current.beds!.total).toBeGreaterThan(10);
    expect(current.beds!.inBudget).toBeLessThanOrEqual(current.beds!.total);
    for (const c of choices) expect(c.nextDistance).toBeGreaterThan(0);
  });

  it("leaves out beds and size while places load", () => {
    const [choice] = stopChoices(trip, 0);
    expect(choice!.beds).toBeUndefined();
    expect(choice!.size).toBeUndefined();
  });
});

describe("bedsNear", () => {
  it("counts in-budget hotels only with a budget", () => {
    const coord = stage!.end.coord;
    expect(bedsNear(index.hotels, coord).inBudget).toBeUndefined();
    const beds = bedsNear(index.hotels, coord, "low");
    expect(beds.inBudget).toBeLessThan(beds.total);
  });
});

describe("townSize", () => {
  it("finds the town by OSM id, else by name nearby", () => {
    expect(townSize(index.towns, stage!.end)).toBe("town");
    const { osmId: _, ...noId } = stage!.end;
    expect(townSize(index.towns, noId)).toBe("town");
    expect(townSize(index.towns, { ...noId, name: "Nowhere" })).toBeUndefined();
  });
});

describe("stopHotels", () => {
  it("lists in-budget hotels first, each by detour", () => {
    const coord = stage!.end.coord;
    const route = routeNear(stage!, next, coord);
    const hotels = stopHotels(index.hotels, coord, route, "low");
    const fits = hotels.map((h) => fitsBudget(h, "low"));
    expect(fits.slice(fits.indexOf(false))).not.toContain(true);
    const inBudget = hotels.filter((h) => fitsBudget(h, "low"));
    const detours = inBudget.map((h) => h.detourKm);
    expect(detours).toEqual([...detours].sort((a, b) => a - b));
    expect(hotels.every((h) => h.distanceKm <= 5)).toBe(true);
  });
});
