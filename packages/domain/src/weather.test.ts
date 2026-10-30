import { describe, expect, it } from "vitest";
import { encodeLine, type RoutePoint, routePoints } from "./line";
import type { Leg, WeatherSample } from "./schema";
import { ridingHours, stageSpeed } from "./time";
import {
  bestStart,
  hourlyAlongStage,
  rideSummary,
  weatherAlongStage,
  windRotation,
} from "./weather";

// About 72 km due east.
const legs: Leg[] = [
  {
    from: [10, 49.9],
    to: [11, 49.9],
    geometry: encodeLine([
      [10, 49.9],
      [11, 49.9],
    ]),
    elevation: [250, 250],
    distance: 72_000,
    ascent: 0,
    descent: 0,
    surface: { paved: 1, gravel: 0, unpaved: 0 },
    provider: "fake",
    profileHash: "touring",
  },
];
const points: RoutePoint[] = routePoints(legs);
const date = "2027-11-02";
const stats = { distance: 72_000, ascent: 0 };

type Weather = Partial<WeatherSample>;

/** Hourly weather by hour of the day, the same everywhere. */
function forecast(byHour: (hour: number) => Weather) {
  return (_: unknown, time: string): WeatherSample => {
    const hour = Number(time.slice(11, 13));
    return {
      time: `${time.slice(0, 13)}:00`,
      temperature: 6,
      apparentTemperature: 3,
      precipitation: 0,
      precipitationProbability: 0,
      // From the west: tailwind when riding east.
      windSpeed: 12,
      windDirection: 270,
      windGusts: 20,
      ...byHour(hour),
    };
  };
}

const ride = (f: ReturnType<typeof forecast>) => (start: string) =>
  weatherAlongStage(points, { date, startTime: start, avgSpeed: 18 }, f);

describe("ridingHours", () => {
  it("adds time for climbing", () => {
    expect(ridingHours({ distance: 72_000, ascent: 0 }, 18)).toBe(4);
    // 6 min per 100 m: 500 m adds half an hour.
    expect(ridingHours({ distance: 72_000, ascent: 500 }, 18)).toBe(4.5);
  });

  it("gives the speed over the whole stage", () => {
    expect(stageSpeed({ distance: 72_000, ascent: 500 }, 18)).toBe(16);
    expect(stageSpeed({ distance: 0, ascent: 0 }, 18)).toBe(18);
  });
});

describe("windRotation", () => {
  it("is 0 for tailwind and 180 for headwind", () => {
    expect(windRotation(90, 270)).toBe(0);
    expect(windRotation(90, 90)).toBe(180);
    expect(windRotation(0, 270)).toBe(90);
  });
});

describe("hourlyAlongStage", () => {
  it("takes the highest rain and the mean feels-like", () => {
    const hours = hourlyAlongStage(
      points,
      date,
      forecast((h) => ({ precipitation: h === 8 ? 1.2 : 0 })),
      [7, 8, 9],
    );
    expect(hours.map((h) => h.time)).toEqual([
      "2027-11-02T07:00",
      "2027-11-02T08:00",
      "2027-11-02T09:00",
    ]);
    expect(hours[1]!.precipitation).toBe(1.2);
    expect(hours[0]!.apparentTemperature).toBe(3);
    expect(hours[0]!.wind).toBe("tail");
    expect(hours[0]!.rotation).toBeCloseTo(0, 0);
  });

  it("leaves out hours without a forecast", () => {
    const hours = hourlyAlongStage(
      points,
      date,
      (c, t) => (t.endsWith("08:00") ? undefined : forecast(() => ({}))(c, t)),
      [7, 8, 9],
    );
    expect(hours).toHaveLength(2);
  });
});

describe("rideSummary", () => {
  it("says when the rain stops and the headwind starts", () => {
    const f = forecast((h) => ({
      precipitation: h < 10 ? 0.8 : 0,
      windDirection: h >= 11 ? 90 : 270,
      windSpeed: 15,
    }));
    const summary = rideSummary(ride(f)("09:00")!);
    expect(summary.rain).toEqual({ kind: "until", time: "10:00" });
    expect(summary.headwind.kind).toBe("from");
  });

  it("is quiet on a dry day with tailwind", () => {
    const summary = rideSummary(ride(forecast(() => ({})))("09:00")!);
    expect(summary.rain).toEqual({ kind: "none" });
    expect(summary.headwind).toEqual({ kind: "none" });
    expect(summary.wind).toBe("tail");
  });
});

describe("bestStart", () => {
  const daylight = {
    date,
    sunrise: `${date}T07:05`,
    sunset: `${date}T16:45`,
  };

  it("waits for the rain to stop", () => {
    const f = forecast((h) => ({ precipitation: h < 10 ? 1.5 : 0 }));
    const best = bestStart(ride(f), {
      stats,
      avgSpeed: 18,
      preferred: "09:00",
      daylight,
    });
    expect(best?.start).toBe("10:00");
    expect(best?.rain).toBe("dry");
    expect(best?.wind).toBe("tail");
  });

  it("avoids headwind when it is dry all day", () => {
    // Headwind in the afternoon.
    const f = forecast((h) => ({
      windDirection: h >= 11 ? 90 : 270,
      windSpeed: 20,
    }));
    const best = bestStart(ride(f), {
      stats,
      avgSpeed: 18,
      preferred: "09:00",
      daylight,
    });
    expect(best?.start).toBe("07:00");
  });

  it("keeps the preferred start when nothing is better", () => {
    const best = bestStart(ride(forecast(() => ({}))), {
      stats,
      avgSpeed: 18,
      preferred: "09:30",
      daylight,
    });
    expect(best?.start).toBe("09:30");
  });

  it("ends before sunset", () => {
    // Dry only late, but a 4 h ride from 12:00 still ends in daylight.
    const f = forecast((h) => ({ precipitation: h < 12 ? 2 : 0 }));
    const best = bestStart(ride(f), {
      stats,
      avgSpeed: 18,
      preferred: "09:00",
      daylight: { ...daylight, sunset: `${date}T15:30` },
    });
    // 12:00 would end at 16:00, after sunset. 11:30 is the latest start.
    expect(best?.start).toBe("11:30");
  });

  it("is undefined without a forecast", () => {
    expect(
      bestStart(() => null, { stats, avgSpeed: 18, preferred: "09:00" }),
    ).toBeUndefined();
  });
});
