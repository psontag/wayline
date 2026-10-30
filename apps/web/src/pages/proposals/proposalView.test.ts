import type {
  GenerateRequest,
  Proposal,
  RoutePoint,
  WindShares,
} from "@wayline/domain";
import { describe, expect, it } from "vitest";
import {
  comparisonTags,
  labelPoints,
  progressValue,
  relaxOptions,
  windTag,
} from "./proposalView";

const request: GenerateRequest = {
  kind: "one-way",
  startStation: { name: "Bamberg", kind: "station", coord: [10.9, 49.9] },
  days: 3,
  kmPerDay: 70,
  maxAscentPerDay: 900,
  profile: "touring",
  hotelBudget: "mid",
  startTime: "09:00",
};

/** Straight line north from lon, about 11 km per 0.1°. */
function line(lon: number): RoutePoint[] {
  return Array.from({ length: 21 }, (_, i) => ({
    coord: [lon, 50 + i * 0.01],
    ele: 300,
    km: i * 1.11,
  }));
}

describe("relaxOptions", () => {
  it("offers more ascent first when stages are too steep", () => {
    const [first, second] = relaxOptions(request, "maxAscentPerDay");
    expect(first).toMatchObject({
      change: "maxAscentPerDay",
      value: 1150,
      request: { maxAscentPerDay: 1150 },
    });
    expect(second).toMatchObject({ change: "kmPerDay", value: 55 });
  });

  it("drops the hotel budget when hotels are missing", () => {
    const [first] = relaxOptions(request, "hotels");
    expect(first?.change).toBe("anyBudget");
    expect(first?.request.hotelBudget).toBeUndefined();
  });

  it("offers nothing for a start outside the network", () => {
    expect(relaxOptions(request, "area")).toEqual([]);
  });
});

describe("labelPoints", () => {
  it("puts each number away from the other routes", () => {
    const shared = line(11);
    const [a, b] = labelPoints([
      shared,
      [...shared.slice(0, 5), ...line(11.2).slice(5)],
    ]);
    expect(a?.[0]).toBe(11);
    expect(b?.[0]).toBe(11.2);
  });
});

describe("progressValue", () => {
  it("grows through the phases", () => {
    const values = [
      progressValue({ phase: "loading", done: 0, total: 0 }),
      progressValue({ phase: "searching", done: 150, total: 300 }),
      progressValue({ phase: "cutting", done: 5, total: 5 }),
      progressValue({ phase: "routing", done: 5, total: 5 }),
    ];
    expect(values).toEqual([...values].sort((x, y) => x - y));
    expect(values.at(-1)).toBe(1);
  });
});

/** A proposal with one leg. Only the fields the tags read are real. */
function proposal(
  id: string,
  km: number,
  ascent: number,
  paved: number,
  signedShare?: number,
): Proposal {
  const leg = {
    distance: km * 1000,
    ascent,
    surface: { paved, gravel: 1 - paved, unpaved: 0 },
  };
  return {
    id,
    signedShare,
    trip: { stages: [{ legs: [leg] }] },
  } as unknown as Proposal;
}

describe("comparisonTags", () => {
  it("tags the clear winner of each measure", () => {
    const tags = comparisonTags([
      proposal("a", 200, 800, 0.95, 0.9),
      proposal("b", 180, 1400, 0.8, 0.6),
      proposal("c", 210, 1300, 0.82, 0.7),
    ]);
    expect(tags.get("a")).toEqual(["flattest", "mostPaved", "mostSigned"]);
    expect(tags.get("b")).toEqual(["shortest"]);
    expect(tags.get("c")).toBeUndefined();
  });

  it("tags nothing when the lead is small", () => {
    const tags = comparisonTags([
      proposal("a", 200, 800, 0.9),
      proposal("b", 203, 850, 0.88),
    ]);
    expect(tags.size).toBe(0);
  });

  it("tags nothing for a single proposal", () => {
    expect(comparisonTags([proposal("a", 200, 800, 0.9)]).size).toBe(0);
  });
});

function wind(head: number, tail: number, avgSpeed = 15): WindShares {
  return {
    head,
    tail,
    cross: 1 - head - tail,
    dominant: head > tail ? "head" : "tail",
    avgSpeed,
  };
}

describe("windTag", () => {
  it("names the day with the most headwind", () => {
    expect(
      windTag([
        { wind: wind(0.1, 0.8), distance: 60 },
        { wind: wind(0.7, 0.1), distance: 60 },
        { wind: wind(0.55, 0.2), distance: 60 },
      ]),
    ).toEqual({ kind: "head", day: 2 });
  });

  it("says mostly tailwind when most km have it", () => {
    expect(
      windTag([
        { wind: wind(0.1, 0.8), distance: 60 },
        { wind: wind(0.3, 0.4), distance: 40 },
      ]),
    ).toEqual({ kind: "tail" });
  });

  it("ignores light wind", () => {
    expect(windTag([{ wind: wind(0.9, 0, 5), distance: 60 }])).toBeUndefined();
  });

  it("hides the tag when a day has no forecast", () => {
    expect(
      windTag([{ wind: wind(0.1, 0.9), distance: 60 }, null]),
    ).toBeUndefined();
  });
});
