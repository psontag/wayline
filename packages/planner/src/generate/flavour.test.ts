import type { GenerateRequest, Proposal } from "@wayline/domain";
import { MockNetworkSource, TiledNetworkSource } from "@wayline/providers";
import { readDataFile, readMockFile } from "@wayline/providers/testing";
import { describe, expect, it } from "vitest";
import { flavourOrder, loadPlanner, Planners } from "./generate";
import { flavourClimb } from "./search";

const heidelberg: GenerateRequest = {
  kind: "multi-day-loop",
  startStation: {
    name: "Heidelberg Hauptbahnhof",
    kind: "station",
    coord: [8.67542, 49.40347],
  },
  days: 3,
  kmPerDay: 70,
  maxAscentPerDay: 900,
  profile: "touring",
  hotelBudget: "mid",
  startTime: "09:00",
};

async function generate(request: GenerateRequest): Promise<Proposal[]> {
  const source = new TiledNetworkSource(readDataFile, "/data/mock/heidelberg");
  const planner = await new Planners(source).for(request);
  const result = await planner.generate(request);
  if (!result.ok) throw new Error(result.failedLimit);
  return result.proposals;
}

function checkFlavours(proposals: Proposal[]) {
  const flavours = proposals.map((p) => p.flavour);
  expect(new Set(flavours).size).toBe(proposals.length);
  for (const p of proposals) {
    expect(p.flavour).toBeDefined();
    expect(p.signedShare).toBeGreaterThanOrEqual(0);
    expect(p.signedShare).toBeLessThanOrEqual(1);
  }
}

describe("flavours", () => {
  it("climbs less on flat and more on hilly, within the limit", () => {
    // Daily average 10 m/km. 5 m/km is free for best, 8 m/km is not.
    const allowed = 10;
    expect(flavourClimb(30, 10, allowed, "best")).toBe(1);
    expect(flavourClimb(80, 10, allowed, "best")).toBe(2);
    expect(flavourClimb(30, 10, allowed, "flat")).toBeGreaterThan(1);
    expect(flavourClimb(80, 10, allowed, "hilly")).toBeLessThan(
      flavourClimb(30, 10, allowed, "hilly"),
    );
    expect(flavourClimb(80, 10, allowed, "hilly")).toBeLessThan(0.1);
    // Far steeper than allowed costs more than flat ground, even on hilly.
    expect(flavourClimb(600, 10, allowed, "hilly")).toBeGreaterThan(1);
  });

  it("puts the theme from the form first, then best", () => {
    expect(flavourOrder(undefined, true)).toEqual([
      "best",
      "nature",
      "flat",
      "hilly",
      "sights",
    ]);
    expect(flavourOrder("water", true)).toEqual([
      "nature",
      "best",
      "flat",
      "hilly",
      "sights",
    ]);
    expect(flavourOrder("wine", true)[0]).toBe("sights");
    expect(flavourOrder("culture", false)).toEqual(["best", "flat", "hilly"]);
  });

  it("proposes one loop per flavour on the Heidelberg tiles", async () => {
    const proposals = await generate(heidelberg);
    checkFlavours(proposals);
    expect(proposals[0]?.flavour).toBe("best");
    expect(proposals.length).toBeGreaterThanOrEqual(3);
    const nature = proposals.find((p) => p.flavour === "nature");
    const best = proposals[0];
    if (nature && best) {
      const share = (p: Proposal) =>
        (p.themes?.nature ?? 0) + (p.themes?.water ?? 0);
      expect(share(nature)).toBeGreaterThan(share(best));
    }
  });

  it("keeps flat the least and hilly the most climbing", async () => {
    const proposals = await generate(heidelberg);
    const ascent = (p: Proposal) =>
      p.trip.stages.reduce((sum, s) => sum + s.stats.ascent, 0);
    const best = proposals.find((p) => p.flavour === "best");
    const hilly = proposals.find((p) => p.flavour === "hilly");
    const flat = proposals.find((p) => p.flavour === "flat");
    expect(hilly).toBeDefined();
    if (!best || !hilly) return;
    expect(ascent(hilly)).toBeGreaterThanOrEqual(1.5 * ascent(best));
    for (const p of proposals) {
      if (p !== hilly) expect(ascent(p)).toBeLessThan(ascent(hilly));
      if (flat && p !== flat) expect(ascent(p)).toBeGreaterThan(ascent(flat));
    }
    for (const s of hilly.trip.stages) {
      expect(s.stats.ascent).toBeLessThanOrEqual(heidelberg.maxAscentPerDay);
    }
  });

  it("starts with the flavour of the theme", async () => {
    const proposals = await generate({ ...heidelberg, theme: "wine" });
    checkFlavours(proposals);
    expect(proposals[0]?.flavour).toBe("sights");
    expect(proposals[1]?.flavour).toBe("best");
  });

  it("skips scenery flavours without scenery data", async () => {
    const planner = await loadPlanner(new MockNetworkSource(readMockFile));
    const result = await planner.generate({
      ...heidelberg,
      theme: "nature",
      startStation: {
        name: "Bamberg",
        kind: "station",
        coord: [10.89973, 49.90064],
      },
      maxAscentPerDay: 1400,
    });
    if (!result.ok) throw new Error(result.failedLimit);
    checkFlavours(result.proposals);
    expect(result.proposals[0]?.flavour).toBe("best");
    for (const p of result.proposals) {
      expect(["best", "flat", "hilly"]).toContain(p.flavour);
    }
  });
});
