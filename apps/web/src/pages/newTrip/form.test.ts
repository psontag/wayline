import type { Places } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import placesJson from "../../../public/data/mock/oberfranken/places.json";
import {
  defaultValues,
  formDays,
  fromRequest,
  newTripSchema,
  toRequest,
  type TripLength,
  type TripShape,
} from "./form";
import { nearbyStation, placeOptions, searchPlaces } from "./places";

const places = placeOptions(placesJson as Places);

describe("searchPlaces", () => {
  it("puts names that start with the query first, towns before stations", () => {
    const names = searchPlaces(places, "coburg").map((p) => p.name);
    expect(names[0]).toBe("Coburg");
    expect(searchPlaces(places, "coburg")[0]!.kind).toBe("town");
    expect(names).toContain("Coburg Nord");
  });

  it("shows big towns for an empty search", () => {
    const shown = searchPlaces(places, "");
    expect(shown.every((p) => p.kind === "town")).toBe(true);
    expect(shown.map((p) => p.name)).toContain("Bamberg");
  });

  it("finds the station next to a town", () => {
    const bamberg = places.find(
      (p) => p.kind === "town" && p.name === "Bamberg",
    )!;
    const near = nearbyStation(bamberg, places);
    expect(near?.station.kind).toBe("station");
    expect(near!.km).toBeLessThan(2);
  });

  it("ignores case and accents", () => {
    expect(searchPlaces(places, "BAMBERG")[0]!.name).toBe("Bamberg");
    expect(searchPlaces(places, "goßweinstein")[0]!.name).toBe("Gößweinstein");
  });

  it("limits the results", () => {
    expect(searchPlaces(places, "a", 5)).toHaveLength(5);
  });
});

describe("new trip form", () => {
  const defaults = defaultValues(places, "2027-06-01");

  it("defaults to Bamberg to Coburg in three days", () => {
    expect(defaults.start).toMatchObject({ name: "Bamberg", kind: "town" });
    expect(defaults.end).toMatchObject({ name: "Coburg", kind: "town" });
    expect(formDays(defaults)).toBe(3);
    expect(defaults.startDate).toBe("2027-06-08");
  });

  it("turns the defaults into a generate request", () => {
    const request = toRequest(defaults);
    expect(request).toMatchObject({
      kind: "one-way",
      startStation: { name: "Bamberg" },
      endStation: { name: "Coburg" },
      days: 3,
      kmPerDay: 70,
      startDate: "2027-06-08",
      dayShares: [1, 1, 1],
    });
  });

  it("makes the first and last day shorter from the times", () => {
    const request = toRequest({
      ...defaults,
      startTime: "13:00",
      backBy: "13:00",
    });
    expect(request.dayShares).toEqual([0.5, 1, 0.5]);
    expect(request.backBy).toBe("13:00");
  });

  it("maps length and shape to the kind", () => {
    const kind = (length: TripLength, shape: TripShape) =>
      toRequest({ ...defaults, length, shape }).kind;
    expect(kind("one", "loop")).toBe("day-loop");
    expect(kind("multi", "loop")).toBe("multi-day-loop");
    expect(kind("one", "ab")).toBe("one-way");
    const oneDay = toRequest({ ...defaults, length: "one" });
    expect(oneDay.days).toBe(1);
    expect(oneDay.dayShares).toBeUndefined();
    expect(oneDay.hotelBudget).toBeUndefined();
  });

  it("drops the end for a loop", () => {
    const request = toRequest({ ...defaults, shape: "loop" });
    expect(request.endStation).toBeUndefined();
  });

  it("needs a last day after the first", () => {
    const result = newTripSchema.safeParse({
      ...defaults,
      endDate: defaults.startDate,
    });
    expect(result.error?.issues[0]?.message).toBe("lastDay");
  });

  it("fills the form from an earlier request", () => {
    const request = toRequest({
      ...defaults,
      endDate: "2027-06-12",
      profile: "scenic",
    });
    expect(toRequest(fromRequest(request, defaults))).toEqual(request);
    const day = toRequest({ ...defaults, length: "one", shape: "loop" });
    expect(toRequest(fromRequest(day, defaults))).toEqual(day);
  });

  it("sends a theme only when one is picked", () => {
    expect(toRequest(defaults).theme).toBeUndefined();
    const request = toRequest({ ...defaults, theme: "water" });
    expect(request.theme).toBe("water");
    expect(fromRequest(request, defaults).theme).toBe("water");
  });
});
