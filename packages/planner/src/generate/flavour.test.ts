import type { GenerateRequest, Proposal } from "@wayline/domain";
import { MockNetworkSource, TiledNetworkSource } from "@wayline/providers";
import { readDataFile, readMockFile } from "@wayline/providers/testing";
import { describe, expect, it } from "vitest";
import { flavourOrder, loadPlanner, Planners } from "./generate";
import { climbFactor, flavourClimb } from "./search";

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
    const allowed = 10;
    const mild = climbFactor(50, 10, allowed);
    expect(flavourClimb(50, 10, allowed, "flat")).toBeGreaterThan(2 * mild);
    expect(flavourClimb(50, 10, allowed, "hilly")).toBeLessThan(mild);
    // Steeper than allowed costs more than flat ground, even on hilly.
    expect(flavourClimb(300, 10, allowed, "hilly")).toBeGreaterThan(1);
    expect(flavourClimb(50, 10, allowed, "best")).toBe(mild);
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
