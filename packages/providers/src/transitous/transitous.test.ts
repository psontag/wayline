import { describe, expect, it } from "vitest";
import {
  localTime,
  parsePlan,
  parseStopId,
  planUrl,
  TransitousTrains,
  utcOffset,
} from "./TransitousTrains";

const leg = (
  mode: string,
  from: string,
  to: string,
  start: string,
  end: string,
  displayName?: string,
) => ({
  mode,
  from: { name: from },
  to: { name: to },
  scheduledStartTime: start,
  scheduledEndTime: end,
  ...(displayName && { displayName }),
});

const ride = (start: string, end: string) => ({
  legs: [
    leg("WALK", "START", "Bamberg", start, start),
    leg("REGIONAL_RAIL", "Bamberg", "Coburg", start, end, "RE29 (4904)"),
    leg("REGIONAL_RAIL", "Coburg", "Bad Rodach", end, end, "RB18 (84452)"),
    leg("WALK", "Bad Rodach", "END", end, end),
  ],
});

const plan = {
  itineraries: [
    ride("2026-11-12T08:54:00Z", "2026-11-12T09:56:00Z"),
    ride("2026-11-12T07:55:00Z", "2026-11-12T08:56:00Z"),
    { legs: [leg("WALK", "START", "END", "x", "y")] },
  ],
};

describe("parsePlan", () => {
  const query = { from: "Bamberg", to: "Bad Rodach", time: "2026-11-12T08:30" };

  it("reads local times, changes and lines, earliest first", () => {
    expect(parsePlan(plan, query)).toEqual([
      {
        from: "Bamberg",
        to: "Bad Rodach",
        departure: "2026-11-12T08:55",
        arrival: "2026-11-12T09:56",
        changes: 1,
        lines: ["RE29", "RB18"],
      },
      expect.objectContaining({ departure: "2026-11-12T09:54" }),
    ]);
  });

  it("keeps only trains that arrive in time", () => {
    const found = parsePlan(plan, {
      ...query,
      time: "2026-11-12T10:00",
      arrival: true,
    });
    expect(found.map((c) => c.arrival)).toEqual(["2026-11-12T09:56"]);
  });
});

describe("times", () => {
  it("converts to and from German local time", () => {
    expect(localTime("2026-07-01T06:00:00Z")).toBe("2026-07-01T08:00");
    expect(utcOffset("2026-07-01T08:00")).toBe("+02:00");
    expect(utcOffset("2026-11-12T08:00")).toBe("+01:00");
  });

  it("asks for arrival or departure at local time", () => {
    const q = { from: "a", to: "b", time: "2026-11-12T09:00" };
    expect(planUrl("1", "2", { ...q, arrival: true })).toContain(
      "time=2026-11-12T09%3A00%3A00%2B01%3A00&arriveBy=true",
    );
    expect(planUrl("1", "2", q)).toContain("arriveBy=false");
  });
});

describe("parseStopId", () => {
  it("takes the first stop", () => {
    expect(
      parseStopId([
        { type: "PLACE", id: "x" },
        { type: "STOP", id: "de-DELFI_de:09473:15151" },
      ]),
    ).toBe("de-DELFI_de:09473:15151");
  });
});

describe("TransitousTrains", () => {
  const response = (body: unknown, ok = true) =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 503,
      text: () => Promise.resolve(JSON.stringify(body)),
    });

  it("looks up each station once", async () => {
    const urls: string[] = [];
    const trains = new TransitousTrains({
      fetch: (url) => {
        urls.push(url);
        return url.includes("/geocode")
          ? response([
              { type: "STOP", id: url.includes("Bamberg") ? "B" : "R" },
            ])
          : response(plan);
      },
    });
    const query = {
      from: "Bamberg",
      to: "Bad Rodach",
      time: "2026-11-12T08:30",
    };
    await trains.connections(query);
    expect(await trains.connections(query)).toHaveLength(2);
    expect(urls.filter((u) => u.includes("/geocode"))).toHaveLength(2);
    expect(urls.at(-1)).toContain("fromPlace=B&toPlace=R");
  });

  it("fails as unavailable when the API is down", async () => {
    const trains = new TransitousTrains({ fetch: () => response("", false) });
    await expect(
      trains.connections({ from: "a", to: "b", time: "2026-11-07T10:00" }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});
