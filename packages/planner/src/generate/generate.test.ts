import type { GenerateRequest, Proposal } from "@wayline/domain";
import { MockNetworkSource } from "@wayline/providers";
import { readMockFile } from "@wayline/providers/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPlanner, type Planner } from "./generate";

const bamberg = {
  name: "Bamberg",
  kind: "station" as const,
  coord: [10.89973, 49.90064] as [number, number],
};

const oneWay: GenerateRequest = {
  kind: "one-way",
  startStation: bamberg,
  days: 4,
  kmPerDay: 80,
  maxAscentPerDay: 1400,
  profile: "touring",
  hotelBudget: "mid",
  startTime: "09:00",
};

const loop: GenerateRequest = {
  ...oneWay,
  kind: "multi-day-loop",
  days: 3,
  kmPerDay: 70,
};

let planner: Planner;
beforeAll(async () => {
  planner = await loadPlanner(new MockNetworkSource(readMockFile));
});

function describeProposal(p: Proposal): string {
  const km = (m: number) => Math.round(m / 1000);
  const total = p.trip.stages.reduce((s, x) => s + x.stats.distance, 0);
  const lines = [`${p.trip.name}: ${km(total)} km, score ${p.score}`];
  for (const [i, s] of p.trip.stages.entries()) {
    const alt = s.end.alternatives.map((a) => a.name).join(", ");
    lines.push(
      `  Day ${i + 1}: ${s.start.name} → ${s.end.name}, ${km(s.stats.distance)} km, ${s.stats.ascent} m` +
        (s.hotel ? `, hotel ${s.hotel.name}` : "") +
        (alt ? ` (alternatives: ${alt})` : ""),
    );
  }
  return lines.join("\n");
}

function checkTrip(p: Proposal, request: GenerateRequest) {
  const { stages } = p.trip;
  expect(stages).toHaveLength(request.days);
  expect(stages[0]?.start.name).toBe("Bamberg");
  for (const [i, s] of stages.entries()) {
    const km = s.stats.distance / 1000;
    expect(km).toBeGreaterThan(0.4 * request.kmPerDay);
    expect(km).toBeLessThan(1.6 * request.kmPerDay);
    if (i < stages.length - 1) {
      expect(s.hotel).toBeDefined();
      expect(stages[i + 1]?.start.coord).toEqual(s.end.coord);
    }
  }
  const total = stages.reduce((sum, s) => sum + s.stats.distance, 0) / 1000;
  const target = request.days * request.kmPerDay;
  expect(Math.abs(total - target)).toBeLessThan(0.1 * target);
}

describe("Planner on the Oberfranken network", () => {
  it("proposes one-way trips", async () => {
    const seen: Proposal[] = [];
    const t = performance.now();
    const result = await planner.generate(oneWay, {
      onProposal: (p) => seen.push(p),
    });
    console.log(`one-way: ${Math.round(performance.now() - t)} ms`);
    if (!result.ok) throw new Error(result.failedLimit);
    expect(result.proposals.length).toBeGreaterThanOrEqual(3);
    expect(seen).toHaveLength(result.proposals.length);
    for (const p of result.proposals) {
      console.log(describeProposal(p));
      checkTrip(p, oneWay);
      expect(p.trip.stages.at(-1)?.end.kind).toBe("station");
      expect(p.routeNames.length).toBeGreaterThan(0);
    }
    const ends = new Set(
      result.proposals.map((p) => p.trip.stages.at(-1)?.end.name),
    );
    expect(ends.size).toBeGreaterThan(1);
  });

  it("ends at the requested station", async () => {
    const request: GenerateRequest = {
      ...oneWay,
      endStation: {
        name: "Coburg",
        kind: "station",
        coord: [10.95751, 50.26276],
      },
      days: 3,
      kmPerDay: 70,
      maxAscentPerDay: 900,
    };
    const result = await planner.generate(request);
    if (!result.ok) throw new Error(result.failedLimit);
    expect(result.proposals.length).toBeGreaterThanOrEqual(3);
    for (const p of result.proposals) {
      console.log(describeProposal(p));
      checkTrip(p, request);
      expect(p.trip.stages.at(-1)?.end.name).toBe("Coburg");
    }
  });

  it("proposes multi-day loops", async () => {
    const t = performance.now();
    const result = await planner.generate(loop);
    console.log(`loop: ${Math.round(performance.now() - t)} ms`);
    if (!result.ok) throw new Error(result.failedLimit);
    expect(result.proposals.length).toBeGreaterThanOrEqual(3);
    for (const p of result.proposals) {
      console.log(describeProposal(p));
      checkTrip(p, loop);
      expect(p.trip.stages.at(-1)?.end.name).toBe("Bamberg");
    }
  });

  it("reports progress", async () => {
    const phases: string[] = [];
    await planner.generate(loop, { onProgress: (p) => phases.push(p.phase) });
    expect([...new Set(phases)]).toEqual(["searching", "cutting", "routing"]);
  });

  it("fails with the limit that does not fit", async () => {
    const tooFar = await planner.generate({
      ...oneWay,
      days: 14,
      kmPerDay: 150,
    });
    expect(tooFar).toEqual({ ok: false, failedLimit: "days" });

    const tooSteep = await planner.generate({ ...loop, maxAscentPerDay: 100 });
    expect(tooSteep).toEqual({ ok: false, failedLimit: "maxAscentPerDay" });

    const nowhere = await planner.generate({
      ...oneWay,
      startStation: { ...bamberg, coord: [8, 48] },
    });
    expect(nowhere).toEqual({ ok: false, failedLimit: "area" });
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      planner.generate(oneWay, { signal: controller.signal }),
    ).rejects.toThrow("Aborted");
  });
});
