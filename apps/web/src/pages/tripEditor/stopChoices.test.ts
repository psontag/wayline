import {
  distanceKm,
  parseTrip,
  type Place,
  type Places,
} from "@wayline/domain";
import { fitsBudget } from "@wayline/providers";
import { describe, expect, it } from "vitest";
import places from "../../../public/data/mock/oberfranken/places.json";
import sample from "../../../public/data/mock/oberfranken/sample-trip.json";
import {
  awayFromStart,
  bedsNear,
  destinationStations,
  hasMovableDestination,
  placeIndex,
  routeNear,
  stopChoices,
  withRouted,
  stopHotels,
  townSize,
} from "./stopChoices";

const trip = parseTrip(sample);
const index = placeIndex(places as Places);
const [stage, next] = trip.stages;

describe("destinationStations", () => {
  const last = trip.stages.at(-1)!;
  const found = destinationStations(last, index);

  it("lists train stops near the end, apart from each other", () => {
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(6);
    for (const [i, place] of found.entries()) {
      expect(place.kind).toBe("station");
      expect(distanceKm(place.coord, last.end.coord)).toBeLessThanOrEqual(20);
      expect(distanceKm(place.coord, last.end.coord)).toBeGreaterThan(2);
      for (const other of found.slice(i + 1)) {
        expect(distanceKm(place.coord, other.coord)).toBeGreaterThan(2);
      }
    }
  });

  it("works only on trips that need not end at the start", () => {
    expect(hasMovableDestination({ ...trip, kind: "one-way" })).toBe(true);
    expect(hasMovableDestination({ ...trip, kind: "multi-day-loop" })).toBe(
      false,
    );
  });
});

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

describe("awayFromStart", () => {
  it("drops alternatives close to where the day starts", () => {
    const s = stage!;
    const [lon, lat] = s.start.coord;
    const near: Place = {
      name: "Near",
      kind: "town",
      coord: [lon + 0.01, lat],
    };
    const far: Place = { name: "Far", kind: "town", coord: [lon + 0.5, lat] };
    expect(awayFromStart(s, [near, far]).map((p) => p.name)).toEqual(["Far"]);
  });
});

describe("withRouted", () => {
  it("uses routed km for alternatives and keeps the current stop", () => {
    const choices = stopChoices(trip, 0);
    const current = choices.find((c) => c.current)!;
    const other = choices.find((c) => !c.current)!;
    const routed = new Map([
      [other.place.name, { distance: 1000, ascent: 5, nextDistance: 2000 }],
      [current.place.name, { distance: 9, ascent: 9 }],
    ]);
    const [first, ...rest] = withRouted(choices, routed);
    expect(first).toMatchObject({ place: other.place, distance: 1000 });
    expect(rest.find((c) => c.current)).toEqual(current);
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
    const noId = { ...stage!.end, osmId: undefined };
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
