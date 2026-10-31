import { describe, expect, it } from "vitest";
import { FakeTrains } from "../mock/FakeTrains";
import {
  DbRestTrains,
  journeysUrl,
  parseJourneys,
  parseStopId,
} from "./DbRestTrains";

const line = (name: string) => ({ name, productName: name.split(" ")[0] });

const journeys = {
  journeys: [
    {
      legs: [
        {
          origin: { name: "Karlsruhe Hbf" },
          destination: { name: "Würzburg Hbf" },
          departure: "2026-11-07T06:14:00+01:00",
          plannedDeparture: "2026-11-07T06:12:00+01:00",
          arrival: "2026-11-07T08:20:00+01:00",
          plannedArrival: "2026-11-07T08:20:00+01:00",
          line: line("ICE 591"),
        },
        {
          origin: { name: "Würzburg Hbf" },
          destination: { name: "Würzburg Hbf" },
          walking: true,
        },
        {
          origin: { name: "Würzburg Hbf" },
          destination: { name: "Bamberg" },
          plannedDeparture: "2026-11-07T08:36:00+01:00",
          plannedArrival: "2026-11-07T09:28:00+01:00",
          line: line("RE 10"),
        },
      ],
    },
    { legs: [] },
  ],
};

describe("parseJourneys", () => {
  it("reads planned local times, changes and lines", () => {
    expect(parseJourneys(journeys)).toEqual([
      {
        from: "Karlsruhe Hbf",
        to: "Bamberg",
        departure: "2026-11-07T06:12",
        arrival: "2026-11-07T09:28",
        changes: 1,
        lines: ["ICE 591", "RE 10"],
      },
    ]);
  });
});

describe("parseStopId", () => {
  it("takes the first stop", () => {
    expect(
      parseStopId([
        { type: "location", id: "x" },
        { type: "stop", id: "8000191", name: "Karlsruhe Hbf" },
      ]),
    ).toBe("8000191");
  });
});

describe("journeysUrl", () => {
  it("asks for arrival or departure", () => {
    const q = { from: "a", to: "b", time: "2026-11-07T09:00" };
    expect(journeysUrl("1", "2", { ...q, arrival: true })).toContain(
      "arrival=2026-11-07T09%3A00",
    );
    expect(journeysUrl("1", "2", q)).toContain("departure=");
  });
});

describe("DbRestTrains", () => {
  const response = (body: unknown, ok = true) =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 503,
      text: () => Promise.resolve(JSON.stringify(body)),
    });

  it("looks up each station once", async () => {
    const urls: string[] = [];
    const trains = new DbRestTrains({
      fetch: (url) => {
        urls.push(url);
        return url.includes("/locations")
          ? response([
              { type: "stop", id: url.includes("Bamberg") ? "2" : "1" },
            ])
          : response(journeys);
      },
    });
    const query = {
      from: "Karlsruhe Hbf",
      to: "Bamberg",
      time: "2026-11-07T10:00",
    };
    await trains.connections(query);
    const found = await trains.connections(query);
    expect(found).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/locations"))).toHaveLength(2);
    expect(urls.at(-1)).toContain("from=1&to=2");
  });

  it("fails as unavailable when the API is down", async () => {
    const trains = new DbRestTrains({ fetch: () => response("", false) });
    await expect(
      trains.connections({ from: "a", to: "b", time: "2026-11-07T10:00" }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

describe("FakeTrains", () => {
  it("arrives before an arrival time", async () => {
    const found = await new FakeTrains().connections({
      from: "Karlsruhe Hbf",
      to: "Bamberg",
      time: "2026-11-07T09:00",
      arrival: true,
    });
    expect(found).toHaveLength(3);
    for (const c of found) expect(c.arrival <= "2026-11-07T09:00").toBe(true);
  });

  it("leaves after a departure time", async () => {
    const found = await new FakeTrains().connections({
      from: "Regensburg Hbf",
      to: "Karlsruhe Hbf",
      time: "2026-11-09T15:30",
    });
    for (const c of found) expect(c.departure >= "2026-11-09T15:30").toBe(true);
  });
});
