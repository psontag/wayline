import type { Places } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import placesJson from "../../../public/data/mock/oberfranken/places.json";
import { defaultValues, fromRequest, newTripSchema, toRequest } from "./form";
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
    expect(defaults.start?.name).toBe("Bamberg");
    expect(defaults.end?.name).toBe("Coburg");
    expect(defaults.days).toBe(3);
    expect(defaults.startDate).toBe("2027-06-08");
  });

  it("turns the defaults into a generate request", () => {
    const request = toRequest(defaults);
    expect(request).toMatchObject({
      kind: "one-way",
      startStation: { name: "Bamberg", kind: "station" },
      endStation: { name: "Coburg", kind: "station" },
      days: 3,
      kmPerDay: 70,
      startDate: "2027-06-08",
    });
  });

  it("drops the end and an empty date for a loop", () => {
    const request = toRequest({
      ...defaults,
      kind: "multi-day-loop",
      startDate: "",
    });
    expect(request.endStation).toBeUndefined();
    expect(request.startDate).toBeUndefined();
  });

  it("fills the form from an earlier request", () => {
    const request = toRequest({ ...defaults, days: 5, profile: "scenic" });
    expect(toRequest(fromRequest(request, defaults))).toEqual(request);
  });

  it("sends a theme only when one is picked", () => {
    expect(toRequest(defaults).theme).toBeUndefined();
    const request = toRequest({ ...defaults, theme: "water" });
    expect(request.theme).toBe("water");
    expect(fromRequest(request, defaults).theme).toBe("water");
  });

  it("needs an end for one-way trips that is not the start", () => {
    const messages = (values: typeof defaults) =>
      newTripSchema.safeParse(values).error?.issues.map((i) => i.message);
    expect(messages({ ...defaults, end: null })).toEqual(["endRequired"]);
    expect(messages({ ...defaults, end: defaults.start })).toEqual([
      "endSameAsStart",
    ]);
    expect(messages({ ...defaults, days: 0, kmPerDay: undefined })).toEqual([
      "days",
      "kmPerDay",
    ]);
  });
});
