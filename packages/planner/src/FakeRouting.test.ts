import { decodeLine, distanceKm, statsFromLegs } from "@wayline/domain";
import { MockNetworkSource } from "@wayline/providers";
import { readMockFile } from "@wayline/providers/testing";
import { describe, expect, it } from "vitest";
import { FakeRouting } from "./FakeRouting";
import { loadGraph } from "./graph";

const graph = loadGraph(new MockNetworkSource(readMockFile));
const routing = new FakeRouting(() => graph);

const bamberg: [number, number] = [10.89973, 49.90064];
const bayreuth: [number, number] = [11.57435, 49.94463];
const kulmbach: [number, number] = [11.4469, 50.1009];

describe("FakeRouting", () => {
  it("routes along the network with geometry and elevation", async () => {
    const legs = await routing.route([bamberg, bayreuth], {
      profile: "touring",
    });
    expect(legs).toHaveLength(1);
    const leg = legs[0]!;
    const coords = decodeLine(leg.geometry);
    expect(coords.length).toBe(leg.elevation.length);
    expect(coords[0]).toEqual(bamberg);
    expect(coords.at(-1)).toEqual(bayreuth);
    // Longer than the straight line, but not absurdly so.
    const straight = distanceKm(bamberg, bayreuth);
    expect(leg.distance / 1000).toBeGreaterThan(straight);
    expect(leg.distance / 1000).toBeLessThan(straight * 2);
    expect(leg.ascent).toBeGreaterThan(200);
    const { paved, gravel, unpaved } = leg.surface;
    expect(paved + gravel + unpaved).toBeCloseTo(1, 2);
  });

  it("returns one leg per pair of points", async () => {
    const legs = await routing.route([bamberg, kulmbach, bayreuth], {
      profile: "touring",
    });
    expect(legs).toHaveLength(2);
    expect(legs[1]!.from).toEqual(kulmbach);
    expect(statsFromLegs(legs).distance).toBeGreaterThan(80_000);
  });

  it("falls back to a straight line off the network", async () => {
    const far: [number, number] = [8, 48];
    const [leg] = await routing.route([bamberg, far], { profile: "touring" });
    expect(decodeLine(leg!.geometry)).toHaveLength(2);
    expect(leg!.distance).toBe(Math.round(distanceKm(bamberg, far) * 1000));
  });
});
