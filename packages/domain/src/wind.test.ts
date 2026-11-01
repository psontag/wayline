import { describe, expect, it } from "vitest";
import { decodeLine, encodeLine } from "./line";
import type { LonLat, Place, Stage, Trip } from "./schema";
import type { WindShares } from "./weather";
import { headwindShare, reverseTrip, windEffort } from "./wind";

const wind = (head: number, tail: number, avgSpeed = 20): WindShares => ({
  head,
  tail,
  cross: 1 - head - tail,
  dominant: head > tail ? "head" : "tail",
  avgSpeed,
});

describe("wind over days", () => {
  const days = [
    { wind: wind(0.8, 0.1), distance: 60_000 },
    { wind: wind(0.2, 0.7), distance: 40_000 },
    { wind: wind(1, 0, 5), distance: 50_000 },
  ];

  it("counts headwind share by distance, calm days as none", () => {
    expect(headwindShare(days)).toBeCloseTo((0.8 * 60 + 0.2 * 40) / 150);
  });

  it("weights head against tail by speed", () => {
    expect(windEffort(days)).toBeCloseTo(60 * 20 * 0.7 + 40 * 20 * -0.5);
  });
});

const surface = { paved: 1, gravel: 0, unpaved: 0 };
const place = (name: string, lon: number): Place => ({
  name,
  kind: "town",
  coord: [lon, 50],
});
const stage = (from: Place, to: Place, hotel?: string): Stage => {
  const line: LonLat[] = [from.coord, [from.coord[0] + 0.05, 50.1], to.coord];
  return {
    id: `${from.name}-${to.name}`,
    start: from,
    end: { ...to, locked: false, alternatives: [] },
    via: [],
    ...(hotel && { hotel: { osmId: hotel, name: hotel, coord: to.coord } }),
    legs: [
      {
        from: from.coord,
        to: to.coord,
        geometry: encodeLine(line),
        elevation: [200, 260, 230],
        distance: 20_000,
        ascent: 60,
        descent: 30,
        surface,
        provider: "test",
        profileHash: "touring",
      },
    ],
    stats: { distance: 20_000, ascent: 60, descent: 30, surface },
  };
};
const [a, b, c, d] = [
  place("Bamberg", 10.9),
  place("Haßfurt", 10.5),
  place("Schweinfurt", 10.2),
  place("Würzburg", 9.9),
] as [Place, Place, Place, Place];

describe("reverseTrip", () => {
  const trip = {
    name: "Bamberg – Würzburg",
    stages: [stage(a, b, "h1"), stage(b, c, "h2"), stage(c, d)],
    settings: { dayShares: [1, 0.5, 0.75] },
    trains: [],
  } as unknown as Trip;

  it("rides the stages backwards", () => {
    const back = reverseTrip(trip);
    const first = trip.stages[0]!;
    const last = trip.stages.at(-1)!;
    expect(back.stages[0]?.start.name).toBe(last.end.name);
    expect(back.stages.at(-1)?.end.name).toBe(first.start.name);
    expect(back.stages[0]?.stats.ascent).toBe(last.stats.descent);
    const line = decodeLine(back.stages[0]!.legs[0]!.geometry);
    expect(line[0]).toEqual(decodeLine(last.legs.at(-1)!.geometry).at(-1));
  });

  it("keeps each hotel at its town", () => {
    const back = reverseTrip(trip);
    const n = trip.stages.length;
    for (let i = 0; i < n - 1; i++) {
      expect(back.stages[i]?.end.name).toBe(trip.stages[n - 2 - i]?.end.name);
      expect(back.stages[i]?.hotel).toEqual(trip.stages[n - 2 - i]?.hotel);
    }
  });

  it("comes back to the same trip", () => {
    const twice = reverseTrip(reverseTrip(trip));
    expect(twice.stages.map((s) => s.legs)).toEqual(
      trip.stages.map((s) => s.legs),
    );
    expect(twice.name).toBe(trip.name);
  });

  it("swaps an A to B name and reverses day shares", () => {
    const back = reverseTrip(trip);
    expect(back.name).toBe("Würzburg – Bamberg");
    expect(back.settings.dayShares).toEqual([0.75, 0.5, 1]);
    const short = reverseTrip({ ...trip, name: "Bamberg – Würz" });
    expect(short.name).toBe("Würz – Bamberg");
  });
});
