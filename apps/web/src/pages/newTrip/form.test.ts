import type { Places } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import placesJson from "../../../public/data/mock/oberfranken/places.json";
import {
  defaultValues,
  detour,
  formDays,
  fromRequest,
  missingPlaces,
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
  const empty = defaultValues("2027-06-01");
  const town = (name: string) =>
    places.find((p) => p.kind === "town" && p.name === name)!;
  const defaults = { ...empty, start: town("Bamberg"), end: town("Coburg") };

  it("starts empty, three days from next week", () => {
    expect(empty.start).toBeNull();
    expect(empty.end).toBeNull();
    expect(formDays(empty)).toBe(3);
    expect(empty.startDate).toBe("2027-06-08");
    expect(empty.kmPerDay).toBe(70);
  });

  it("can't find routes without a start, or an end for A to B", () => {
    expect(missingPlaces(empty)).toBe("startAndEnd");
    expect(missingPlaces({ ...empty, shape: "loop" })).toBe("start");
    expect(missingPlaces({ ...empty, start: defaults.start })).toBe("end");
    expect(missingPlaces({ ...defaults, end: null, shape: "loop" })).toBe(
      undefined,
    );
    expect(missingPlaces(defaults)).toBeUndefined();
    const result = newTripSchema.safeParse({ ...empty, shape: "loop" });
    expect(result.error?.issues[0]?.message).toBe("startRequired");
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

  it("suggests km per day when A to B is much shorter than planned", () => {
    const place = (name: string, coord: [number, number]) => ({
      name,
      kind: "town" as const,
      coord,
    });
    const ab = {
      ...defaults,
      shape: "ab" as const,
      start: place("Bamberg", [10.887, 49.892]),
      end: place("Würzburg", [9.931, 49.793]),
      kmPerDay: 70,
    };
    // About 70 km apart, so about 90 km by bike.
    expect(detour(ab, 3)).toEqual({ km: 90, kmPerDay: 30 });
    expect(detour({ ...ab, kmPerDay: 30 }, 3)).toBeUndefined();
    expect(detour({ ...ab, shape: "loop" }, 3)).toBeUndefined();
  });
  it("round-trips an open day ride with the wind", () => {
    const values = {
      ...defaults,
      length: "one" as const,
      shape: "open" as const,
    };
    expect(values.withWind).toBe(true);
    const request = toRequest(values);
    expect(request).toMatchObject({ kind: "one-way", days: 1, withWind: true });
    expect(request.endStation).toBeUndefined();
    const back = fromRequest(request, defaults);
    expect(back.shape).toBe("open");
    expect(back.length).toBe("one");
    expect(back.withWind).toBe(true);
    expect(
      fromRequest({ ...request, withWind: false }, defaults).withWind,
    ).toBe(false);
  });
});
