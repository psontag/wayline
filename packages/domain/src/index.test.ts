import { describe, expect, it } from "vitest";
import {
  bahnUrl,
  bookingUrl,
  dayShares,
  decodeLine,
  encodeLine,
  expectedTimeAtKm,
  GenerateRequest,
  type Leg,
  pointAtKm,
  relativeWind,
  routePoints,
  SCHEMA_VERSION,
  sampleAt,
  stageDates,
  stageStartTime,
  statsFromLegs,
  weatherAlongStage,
  windShares,
  type WeatherSample,
} from "./index";

describe("SCHEMA_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

const leg = (over: Partial<Leg>): Leg => ({
  from: [10.9, 49.9],
  to: [11, 49.9],
  geometry: encodeLine([
    [10.9, 49.9],
    [11, 49.9],
  ]),
  elevation: [250, 300],
  distance: 10_000,
  ascent: 100,
  descent: 50,
  surface: { paved: 1, gravel: 0, unpaved: 0 },
  provider: "fake",
  profileHash: "touring",
  ...over,
});

describe("statsFromLegs", () => {
  it("sums distance and climbing and weights surface by distance", () => {
    const stats = statsFromLegs([
      leg({}),
      leg({
        distance: 30_000,
        ascent: 200,
        descent: 0,
        surface: { paved: 0.5, gravel: 0.5, unpaved: 0 },
      }),
    ]);
    expect(stats.distance).toBe(40_000);
    expect(stats.ascent).toBe(300);
    expect(stats.descent).toBe(50);
    expect(stats.surface.paved).toBeCloseTo(0.625);
    expect(stats.surface.gravel).toBeCloseTo(0.375);
    expect(stats.surface.unpaved).toBe(0);
  });

  it("returns zeros without legs", () => {
    expect(statsFromLegs([]).surface.paved).toBe(0);
  });
});

describe("stageDates", () => {
  it("adds one day per stage across month ends", () => {
    expect(stageDates("2027-06-29", 3)).toEqual([
      "2027-06-29",
      "2027-06-30",
      "2027-07-01",
    ]);
  });
});

describe("expectedTimeAtKm", () => {
  it("uses start time and average speed", () => {
    expect(expectedTimeAtKm("2027-06-12", "09:00", 18, 0)).toBe(
      "2027-06-12T09:00",
    );
    expect(expectedTimeAtKm("2027-06-12", "09:00", 18, 45)).toBe(
      "2027-06-12T11:30",
    );
  });
});

describe("dayShares", () => {
  it("shortens the first and last day by the time lost", () => {
    expect(dayShares(3, "13:00", "17:00")).toEqual([0.5, 1, 1]);
    expect(dayShares(3, "09:00", "13:00")).toEqual([1, 1, 0.5]);
    expect(dayShares(2, "07:00")).toEqual([1, 1]);
  });

  it("never goes below a quarter day", () => {
    expect(dayShares(2, "16:00", "10:00")).toEqual([0.25, 0.25]);
  });

  it("keeps a one-day trip full", () => {
    expect(dayShares(1, "15:00", "16:00")).toEqual([1]);
  });
});

describe("stageStartTime", () => {
  it("starts later days at nine", () => {
    const settings = { startTime: "13:00" };
    expect(stageStartTime(settings, 0)).toBe("13:00");
    expect(stageStartTime(settings, 1)).toBe("09:00");
  });

  it("uses the chosen ride start", () => {
    const settings = { startTime: "13:00", rideStarts: [null, "10:30"] };
    expect(stageStartTime(settings, 0)).toBe("13:00");
    expect(stageStartTime(settings, 1)).toBe("10:30");
    expect(stageStartTime(settings, 2)).toBe("09:00");
  });
});

describe("relativeWind", () => {
  it("tells head, tail and cross wind", () => {
    // Riding north. Wind from the north blows into the face.
    expect(relativeWind(0, 0)).toBe("head");
    expect(relativeWind(0, 180)).toBe("tail");
    expect(relativeWind(0, 90)).toBe("cross");
    expect(relativeWind(350, 20)).toBe("head");
    expect(relativeWind(90, 280)).toBe("tail");
  });
});

describe("windShares", () => {
  it("weights by distance", () => {
    const shares = windShares([
      { distance: 3, bearing: 0, windSpeed: 10, windDirection: 180 },
      { distance: 1, bearing: 0, windSpeed: 20, windDirection: 0 },
    ]);
    expect(shares.tail).toBeCloseTo(0.75);
    expect(shares.head).toBeCloseTo(0.25);
    expect(shares.dominant).toBe("tail");
    expect(shares.avgSpeed).toBeCloseTo(12.5);
  });
});

describe("lines", () => {
  it("round-trips an encoded line", () => {
    const coords: [number, number][] = [
      [10.89973, 49.90064],
      [11.57435, 49.94463],
    ];
    expect(decodeLine(encodeLine(coords))).toEqual(coords);
  });

  it("joins legs and interpolates by km", () => {
    const points = routePoints([
      leg({}),
      leg({
        from: [11, 49.9],
        geometry: encodeLine([
          [11, 49.9],
          [11.1, 49.9],
        ]),
      }),
    ]);
    expect(points).toHaveLength(3);
    const total = points.at(-1)!.km;
    expect(total).toBeCloseTo(14.3, 0);
    const mid = pointAtKm(points, total / 4);
    expect(mid.coord[0]).toBeCloseTo(10.95, 2);
    expect(mid.ele).toBeCloseTo(275, 0);
  });
});

describe("weather along a stage", () => {
  const sample = (time: string): WeatherSample => ({
    time,
    temperature: 20,
    precipitation: 0,
    precipitationProbability: 0.1,
    windSpeed: 15,
    // From the west: tail wind when riding east.
    windDirection: 270,
    apparentTemperature: 18,
    windGusts: 25,
  });

  it("finds the nearest hourly sample", () => {
    const samples = [sample("2027-06-12T09:00"), sample("2027-06-12T10:00")];
    expect(sampleAt(samples, "2027-06-12T09:40")?.time).toBe(
      "2027-06-12T10:00",
    );
    expect(sampleAt(samples, "2027-06-13T09:00")).toBeUndefined();
  });

  it("samples at the expected time", () => {
    const points = routePoints([leg({})]);
    const times: string[] = [];
    const weather = weatherAlongStage(
      points,
      { date: "2027-06-12", startTime: "09:00", avgSpeed: 18 },
      (_, time) => {
        times.push(time);
        return sample(time);
      },
      5,
    );
    expect(times[0]).toBe("2027-06-12T09:00");
    expect(weather?.wind.dominant).toBe("tail");
    expect(weather?.temperature).toEqual({ min: 20, max: 20 });
  });

  it("is null without a forecast", () => {
    const points = routePoints([leg({})]);
    const timing = { date: "2027-06-12", startTime: "09:00", avgSpeed: 18 };
    expect(weatherAlongStage(points, timing, () => undefined)).toBeNull();
  });
});

describe("links", () => {
  it("builds the Booking.com search link", () => {
    expect(
      bookingUrl({
        town: "Kronach",
        date: "2027-06-13",
        budget: "mid",
        minRating: 80,
      }),
    ).toBe(
      "https://www.booking.com/searchresults.html?ss=Kronach&checkin=2027-06-13&checkout=2027-06-14&group_adults=1&no_rooms=1&nflt=review_score%3D80%3Bprice%3DEUR-80-140-1",
    );
    expect(bookingUrl({ town: "Bad Rodach" })).toBe(
      "https://www.booking.com/searchresults.html?ss=Bad%20Rodach&group_adults=1&no_rooms=1",
    );
  });

  it("builds the bahn.de link", () => {
    expect(
      bahnUrl({ from: "Bamberg", to: "Bad Rodach", time: "2027-06-12T08:00" }),
    ).toBe(
      "https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=Bamberg&zo=Bad%20Rodach&hd=2027-06-12T08%3A00%3A00&hza=D",
    );
  });
});

describe("GenerateRequest", () => {
  const base = {
    kind: "one-way",
    days: 4,
    kmPerDay: 80,
    maxAscentPerDay: 1200,
    profile: "touring",
  };

  it("needs a region or a start station", () => {
    expect(GenerateRequest.safeParse(base).success).toBe(false);
    const ok = GenerateRequest.parse({
      ...base,
      region: [10.5, 49.6, 12, 50.5],
    });
    expect(ok.startTime).toBe("09:00");
  });
});
