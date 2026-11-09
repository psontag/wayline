import type {
  GenerateRequest,
  Proposal,
  RoutePoint,
  RouteTag,
  StageWeather,
  WindShares,
} from "@wayline/domain";
import { describe, expect, it } from "vitest";
import {
  comparisonTags,
  labelPoints,
  progressValue,
  rainTag,
  relaxOptions,
  shortRequest,
  shownRouteTags,
  titleRoutes,
  titleTowns,
  windTag,
  withDays,
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

describe("shortRequest", () => {
  const toWuerzburg: GenerateRequest = {
    ...request,
    endStation: { name: "Würzburg", kind: "station", coord: [9.931, 49.793] },
  };

  it("offers fewer days when A to B is much shorter than planned", () => {
    const short = shortRequest(toWuerzburg);
    expect(short).toMatchObject({ km: 90, days: 2, plannedKm: 210 });
    const fewer = withDays(toWuerzburg, short!.days);
    expect(fewer.days).toBe(2);
    expect(withDays(toWuerzburg, 1).hotelBudget).toBeUndefined();
  });

  it("says nothing on a stretch of a signed route", () => {
    expect(
      shortRequest({ ...toWuerzburg, route: "Main-Radweg" }),
    ).toBeUndefined();
  });

  it("says nothing without an end or when the days fit", () => {
    expect(shortRequest(request)).toBeUndefined();
    expect(shortRequest({ ...toWuerzburg, days: 2, kmPerDay: 60 })).toBe(
      undefined,
    );
  });
});

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

  it("keeps away from stops", () => {
    const [a] = labelPoints([line(11)], [[11, 50.1]]);
    expect(Math.abs((a?.[1] ?? 0) - 50.1)).toBeGreaterThan(0.05);
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
    trip: { settings: { avgSpeed: 18 }, stages: [{ legs: [leg], stats: leg }] },
  } as unknown as Proposal;
}

describe("comparisonTags", () => {
  it("tags the clear winner of each measure", () => {
    const tags = comparisonTags([
      proposal("a", 200, 800, 0.95, 0.9),
      proposal("b", 180, 1400, 0.8, 0.6),
      proposal("c", 210, 1300, 0.82, 0.7),
    ]);
    expect(tags.get("a")).toEqual(["flattest", "mostPaved"]);
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

describe("shownRouteTags", () => {
  const tagged = (id: string, tags: RouteTag[]) =>
    ({ id, tags }) as unknown as Proposal;

  it("hides tags more than half the proposals have, rarest first", () => {
    const shown = shownRouteTags([
      tagged("a", ["flat", "water", "wine", "gravel"]),
      tagged("b", ["flat", "water"]),
      tagged("c", ["flat", "gravel"]),
      tagged("d", []),
    ]);
    expect(shown.get("a")).toEqual(["wine", "water", "gravel"]);
    expect(shown.get("c")).toEqual(["gravel"]);
  });

  it("shows leaving the inputs first, and hides Longer when most are", () => {
    const shown = shownRouteTags([
      tagged("a", ["wine", "longer"]),
      tagged("b", ["longer"]),
      tagged("c", ["shorter", "moreClimbing"]),
    ]);
    expect(shown.get("a")).toEqual(["wine"]);
    expect(shown.get("c")).toEqual(["shorter", "moreClimbing"]);
  });

  it("always shows More climbing", () => {
    const shown = shownRouteTags([
      tagged("a", ["moreClimbing"]),
      tagged("b", ["moreClimbing"]),
    ]);
    expect(shown.get("a")).toEqual(["moreClimbing"]);
  });

  it("keeps all tags of a single proposal", () => {
    expect(shownRouteTags([tagged("a", ["flat"])]).get("a")).toEqual(["flat"]);
  });
});

describe("rainTag", () => {
  const day = (mm: number) => ({ maxPrecipitation: mm }) as StageWeather;

  it("names the first wet day on longer trips", () => {
    expect(rainTag([day(0), day(3), day(4)])).toEqual({ kind: "rain", day: 2 });
    expect(rainTag([day(3)])).toEqual({ kind: "rain" });
  });

  it("says dry when all days are, and nothing for light rain", () => {
    expect(rainTag([day(0), day(0)])).toEqual({ kind: "dry" });
    expect(rainTag([day(0.5)])).toBeUndefined();
    expect(rainTag(undefined)).toBeUndefined();
  });
});

describe("titleTowns", () => {
  it("prefers a town no earlier proposal is named after", () => {
    const towns = titleTowns([
      { id: "a", via: ["Speyer", "Worms"] },
      { id: "b", via: ["Speyer", "Worms"] },
      { id: "c", via: [] },
    ] as unknown as Proposal[]);
    expect(towns.get("a")).toBe("Speyer");
    expect(towns.get("b")).toBe("Worms");
    expect(towns.has("c")).toBe(false);
  });
});

describe("titleRoutes", () => {
  it("names one proposal per route", () => {
    const routes = titleRoutes([
      { id: "a", followedRoute: "Main-Radweg" },
      { id: "b", followedRoute: "Main-Radweg" },
      { id: "c", followedRoute: "Altmühltal-Radweg" },
      { id: "d" },
    ] as unknown as Proposal[]);
    expect(routes.get("a")).toBe("Main-Radweg");
    expect(routes.has("b")).toBe(false);
    expect(routes.get("c")).toBe("Altmühltal-Radweg");
    expect(routes.has("d")).toBe(false);
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

describe("comparisonTags with wind", () => {
  const [a, b] = [proposal("a", 100, 500, 0.9), proposal("b", 100, 500, 0.9)];

  it("tags clearly the least headwind once all are known", () => {
    const tags = (h: [string, number][]) =>
      comparisonTags([a, b], new Map(h)).get("b") ?? [];
    expect(
      tags([
        ["a", 0.6],
        ["b", 0.2],
      ]),
    ).toContain("leastHeadwind");
    expect(
      tags([
        ["a", 0.25],
        ["b", 0.2],
      ]),
    ).not.toContain("leastHeadwind");
    expect(tags([["b", 0.2]])).not.toContain("leastHeadwind");
  });
});
