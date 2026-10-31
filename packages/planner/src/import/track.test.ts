import { type LonLat, parseTrip, type Place } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import {
  type ImportedDay,
  importedTrip,
  simplifyTrack,
  type TrackPoint,
  trackLegs,
} from "./track";

/** Points every ~98 m going east from lon, with a climb of 1 m each. */
function line(lon: number, count: number, ele = true): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    coord: [lon + i * 0.00137, 50] as LonLat,
    ...(ele ? { ele: 300 + i } : {}),
  }));
}

const place = (coord: LonLat, name: string): Place => ({
  name,
  kind: "town",
  coord,
});

function day(points: TrackPoint[]): ImportedDay {
  const legs = trackLegs(points, "touring");
  return {
    start: place(legs[0]?.from ?? [0, 0], "A"),
    end: place(legs.at(-1)?.to ?? [0, 0], "B"),
    legs,
  };
}

describe("simplifyTrack", () => {
  it("drops points on a straight line and keeps corners", () => {
    const straight = line(10, 50);
    expect(simplifyTrack(straight)).toHaveLength(2);
    const corner: TrackPoint[] = [
      ...straight,
      { coord: [10 + 49 * 0.00137, 50.01] },
    ];
    expect(simplifyTrack(corner)).toHaveLength(3);
  });
});

describe("trackLegs", () => {
  it("cuts a track into legs of about 10 km that join up", () => {
    const legs = trackLegs(line(10, 251), "touring");
    expect(legs).toHaveLength(3);
    expect(legs[0]?.distance).toBeGreaterThan(9900);
    expect(legs[0]?.to).toEqual(legs[1]?.from);
    const total = legs.reduce((sum, leg) => sum + leg.distance, 0);
    expect(total).toBeGreaterThan(24_000);
    expect(total).toBeLessThan(25_000);
    expect(legs.reduce((sum, leg) => sum + leg.ascent, 0)).toBe(250);
    expect(legs[0]?.surface).toEqual({ paved: 0, gravel: 0, unpaved: 0 });
  });

  it("keeps a flat profile without elevation", () => {
    const [leg] = trackLegs(line(10, 20, false), "touring");
    expect(leg?.ascent).toBe(0);
    expect(leg?.elevation.every((e) => e === 0)).toBe(true);
  });
});

describe("importedTrip", () => {
  const base = {
    id: "t1",
    now: new Date("2026-10-31T10:00:00Z"),
    name: "Test",
    profile: "touring" as const,
    startTime: "09:00",
  };

  it("makes a valid one-way trip with locked stops", () => {
    const trip = importedTrip({
      ...base,
      hotelBudget: "mid",
      days: [day(line(10, 300)), day(line(10.41, 200))],
    });
    expect(() => parseTrip(trip)).not.toThrow();
    expect(trip.kind).toBe("one-way");
    expect(trip.stages.every((s) => s.end.locked)).toBe(true);
    expect(trip.proposed).toEqual(trip.stages);
    expect(trip.settings.kmPerDay).toBeCloseTo(29.3, 0);
  });

  it("drops the hotel on the last day", () => {
    const hotel = { osmId: "h", name: "H", coord: [10, 50] as LonLat };
    const trip = importedTrip({
      ...base,
      days: [
        { ...day(line(10, 50)), hotel },
        { ...day(line(10.07, 50)), hotel },
      ],
    });
    expect(trip.stages[0]?.hotel).toEqual(hotel);
    expect(trip.stages[1]?.hotel).toBeUndefined();
  });

  it("is a loop when it ends near the start", () => {
    const out = line(10, 100);
    const back = [...out].reverse();
    const trip = importedTrip({ ...base, days: [day(out), day(back)] });
    expect(trip.kind).toBe("multi-day-loop");
  });
});
