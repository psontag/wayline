import {
  bearing,
  type GenerateRequest,
  type HourlyWind,
  type LonLat,
  type Proposal,
} from "@wayline/domain";
import { TiledNetworkSource } from "@wayline/providers";
import { readDataFile } from "@wayline/providers/testing";
import { describe, expect, it } from "vitest";
import { Planners } from "./generate";
import { windFactor } from "./wind";

const home: LonLat = [8.67542, 49.40347];

/** The same wind all day. from: degrees the wind comes from. */
function steady(from: number, speed: number): HourlyWind[] {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, from, speed }));
}

const open: GenerateRequest = {
  kind: "one-way",
  startStation: {
    name: "Heidelberg Hauptbahnhof",
    kind: "station",
    coord: home,
  },
  days: 1,
  kmPerDay: 60,
  maxAscentPerDay: 900,
  profile: "touring",
  startTime: "09:00",
};

async function generate(
  request: GenerateRequest,
  wind?: HourlyWind[],
): Promise<Proposal[]> {
  const source = new TiledNetworkSource(readDataFile, "/data/mock/heidelberg");
  const planner = await new Planners(source).for(request);
  const result = await planner.generate(request, wind ? { wind } : {});
  if (!result.ok) throw new Error(result.failedLimit);
  return result.proposals;
}

/** Bearing from home to where the ride goes: its end, or its start if homeward. */
function heading(p: Proposal): number {
  const stage = p.homeward
    ? p.trip.stages[0]?.start
    : p.trip.stages.at(-1)?.end;
  return bearing(home, stage?.coord ?? home);
}

function turn(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("windFactor", () => {
  const east: LonLat[] = [home, [home[0] + 0.8, home[1]]];

  it("costs more into the wind and less with it", () => {
    expect(
      windFactor(east, 60, { wind: steady(90, 20), startHour: 9 }),
    ).toBeGreaterThan(1.3);
    expect(
      windFactor(east, 60, { wind: steady(270, 20), startHour: 9 }),
    ).toBeLessThan(0.9);
    expect(
      windFactor(east, 60, { wind: steady(0, 20), startHour: 9 }),
    ).toBeCloseTo(1, 2);
  });

  it("ignores calm wind", () => {
    expect(windFactor(east, 60, { wind: steady(90, 8), startHour: 9 })).toBe(1);
  });

  it("prefers headwind early and tailwind late on a loop", () => {
    const out: LonLat = [home[0] - 0.4, home[1]];
    const ride = { wind: steady(270, 20), startHour: 9 };
    const upwindFirst = windFactor([home, out, home], 60, ride);
    const downwindFirst = windFactor([out, home, out], 60, ride);
    expect(upwindFirst).toBeLessThan(downwindFirst);
  });

  it("uses the wind of the hour each part is ridden", () => {
    // From the east until 11, then from the west: ride west, then east.
    const turning = steady(90, 20).map((w) =>
      w.hour >= 11 ? { ...w, from: 270 } : w,
    );
    const out: LonLat = [home[0] + 0.4, home[1]];
    const ride = { wind: turning, startHour: 9 };
    const back: LonLat = [home[0] - 0.4, home[1]];
    expect(windFactor([home, back, home], 60, ride)).toBeLessThan(
      windFactor([home, out, home], 60, ride),
    );
  });
});

describe("open day ride", () => {
  it("goes to ends in different directions", async () => {
    const proposals = await generate(open);
    expect(proposals.length).toBeGreaterThanOrEqual(3);
    const headings = proposals.map(heading);
    for (const [i, a] of headings.entries()) {
      for (const b of headings.slice(0, i))
        expect(turn(a, b)).toBeGreaterThanOrEqual(45);
    }
    for (const p of proposals) {
      expect(p.flavour).toBeUndefined();
      expect(p.trip.stages).toHaveLength(1);
      expect(p.trip.stages[0]!.end.kind).toBe("station");
    }
    expect(proposals.some((p) => p.homeward)).toBe(false);
  });

  it("puts rides with the wind first", async () => {
    // Wind from the south: riding north has the tailwind.
    const proposals = await generate(open, steady(180, 25));
    const [first] = proposals;
    expect(first).toBeDefined();
    expect(turn(heading(first!), 0)).toBeLessThan(70);
  });

  it("may ride home from a station upwind", async () => {
    const proposals = await generate(open, steady(180, 25));
    const homeward = proposals.filter((p) => p.homeward);
    expect(homeward.length).toBeLessThanOrEqual(1);
    for (const p of homeward) {
      const stage = p.trip.stages[0]!;
      expect(stage.start.kind).toBe("station");
      expect(stage.end.name).toBe("Heidelberg Hauptbahnhof");
      // Starts south, so the wind pushes it home.
      expect(turn(heading(p), 180)).toBeLessThan(90);
      expect(p.trip.name).toBe(`${stage.start.name} – Heidelberg Hauptbahnhof`);
    }
  });
});

describe("day loop with the wind", () => {
  it("rides out against the wind", async () => {
    const loop: GenerateRequest = { ...open, kind: "day-loop" };
    const proposals = await generate(loop, steady(270, 25));
    const [best] = proposals;
    expect(best).toBeDefined();
    // The first half of the loop heads west, into the wind.
    const coords = best!.trip.stages[0]!.legs.map((l) => l.to);
    const half = coords[Math.floor(coords.length / 3)] ?? home;
    const lonOut = half[0] - home[0];
    expect(lonOut).toBeLessThan(0);
  });
});
