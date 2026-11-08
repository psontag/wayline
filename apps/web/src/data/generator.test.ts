import { byRank, type GenerateRequest, type Proposal } from "@wayline/domain";
import { readDataFile, readMockFile } from "@wayline/providers/testing";
import { expose, wrap } from "comlink";
import { describe, expect, it } from "vitest";
import { createTripGenerator, type PlannerWorker } from "./generator";
import { createPlannerApi } from "./plannerApi";

// Runs the planner in-process over a MessageChannel, like a worker.
function connect(): PlannerWorker {
  const { port1, port2 } = new MessageChannel();
  expose(createPlannerApi(readMockFile), port2);
  return {
    api: wrap(port1),
    terminate: () => {
      port1.close();
      port2.close();
    },
  };
}

const request: GenerateRequest = {
  kind: "multi-day-loop",
  startStation: {
    name: "Bamberg",
    kind: "station",
    coord: [10.89973, 49.90064],
  },
  days: 3,
  kmPerDay: 70,
  maxAscentPerDay: 1400,
  profile: "touring",
  startTime: "09:00",
};

describe("createTripGenerator", () => {
  it("streams progress and proposals", async () => {
    const generator = createTripGenerator({ dataUrl: "/data", connect });
    const phases: string[] = [];
    const seen: Proposal[] = [];
    const result = await generator.generate(request, {
      onProgress: (p) => phases.push(p.phase),
      onProposal: (p) => seen.push(p),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // They arrive as found. Sorted by rank, they are the result.
    expect([...seen].sort(byRank).map((p) => p.id)).toEqual(
      result.proposals.map((p) => p.id),
    );
    expect(phases[0]).toBe("loading");
    expect(phases).toContain("searching");
    expect(phases.at(-1)).toBe("routing");
  });

  it("rejects with an AbortError when cancelled", async () => {
    const generator = createTripGenerator({ dataUrl: "/data", connect });
    const controller = new AbortController();
    const run = generator.generate(request, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    // The next run starts a fresh planner.
    const again = await generator.generate(request);
    expect(again.ok).toBe(true);
  });
});

describe("createPlannerApi", () => {
  it("plans on tiled region data", async () => {
    const api = createPlannerApi(readDataFile);
    const result = await api.generate(
      {
        ...request,
        startStation: {
          name: "Heidelberg Hauptbahnhof",
          kind: "station",
          coord: [8.67542, 49.40347],
        },
        maxAscentPerDay: 900,
      },
      "/data/mock/heidelberg",
    );
    if (!result.ok) throw new Error(result.failedLimit);
    expect(result.proposals.length).toBeGreaterThanOrEqual(2);
  });

  it("loads the network once when prepare and generate overlap", async () => {
    const reads = new Map<string, number>();
    const api = createPlannerApi((url) => {
      reads.set(url, (reads.get(url) ?? 0) + 1);
      return readMockFile(url);
    });
    const prepared = api.prepare(request, "/data");
    const result = await api.generate(request, "/data");
    await prepared;
    expect(result.ok).toBe(true);
    expect(reads.get("/data/network.json")).toBe(1);
    expect(reads.get("/data/places.json")).toBe(1);
  });
});
