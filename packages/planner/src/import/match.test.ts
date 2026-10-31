import { encodeLine, type LonLat, type RouteNetwork } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Graph } from "../graph/Graph";
import { matchTrack } from "./match";
import { offNetworkKm, type TrackPoint, trackLegs } from "./track";

// One gravel edge going north along lon 11.0, from 300 m to 400 m.
const network: RouteNetwork = {
  version: "test",
  nodes: [
    { id: 0, lon: 11, lat: 50, kind: "junction", hotelCount: 0 },
    { id: 1, lon: 11, lat: 50.1, kind: "junction", hotelCount: 0 },
  ],
  edges: [
    {
      id: 0,
      from: 0,
      to: 1,
      lengthKm: 11.1,
      pavedShare: 0,
      surface: { paved: 0, gravel: 1, unpaved: 0 },
      network: "rcn",
      routes: [],
      score: 1,
      ascent: 100,
      descent: 0,
      geometry: encodeLine([
        [11, 50],
        [11, 50.1],
      ]),
      elevation: [300, 400],
    },
  ],
};
const graph = new Graph(network);

/** Points from a to b, every ~100 m. */
function track(a: LonLat, b: LonLat): TrackPoint[] {
  const n = 40;
  return Array.from({ length: n + 1 }, (_, i) => ({
    coord: [
      a[0] + ((b[0] - a[0]) * i) / n,
      a[1] + ((b[1] - a[1]) * i) / n,
    ] as LonLat,
  }));
}

describe("matchTrack", () => {
  it("takes surface and elevation from the edge the track runs along", () => {
    // 10 m east of the edge.
    const points = matchTrack(
      graph,
      track([11.00014, 50.01], [11.00014, 50.05]),
    );
    expect(points.every((p) => p.surface?.gravel === 1)).toBe(true);
    expect(points[0]?.ele).toBeCloseTo(310, 0);
    expect(points[0]?.climb).toBeUndefined();
    // 0.4 of the edge, which climbs 100 m.
    const sum = points.reduce((s, p) => s + (p.climb?.[0] ?? 0), 0);
    expect(sum).toBeCloseTo(40, 0);
    expect(points.at(-1)?.ele).toBeCloseTo(350, 0);
  });

  it("keeps elevation from the file", () => {
    const [point] = matchTrack(graph, [
      { coord: [11, 50.01], ele: 123 },
      { coord: [11, 50.02], ele: 124 },
    ]);
    expect(point).toEqual({
      coord: [11, 50.01],
      ele: 123,
      surface: { paved: 0, gravel: 1, unpaved: 0 },
    });
  });

  it("leaves points away from the edge or across it alone", () => {
    const away = matchTrack(graph, track([11.01, 50.01], [11.01, 50.05]));
    expect(away.some((p) => p.surface)).toBe(false);
    const across = matchTrack(graph, track([10.99, 50.05], [11.01, 50.05]));
    expect(across.some((p) => p.surface)).toBe(false);
  });
});

describe("matched legs", () => {
  it("count km off the network as unknown and fill elevation between", () => {
    // 4.4 km on the edge, then 0.8 km east, away from it.
    const on = matchTrack(graph, track([11, 50.01], [11, 50.05]));
    const off = track([11.001, 50.05], [11.011, 50.05]);
    const points = [
      ...on,
      ...off.slice(1),
      { coord: [11.012, 50.05] as LonLat, ele: 350 },
    ];
    const [leg] = trackLegs(points, "touring");
    expect(leg?.surface.gravel).toBeGreaterThan(0.8);
    expect(leg?.surface.gravel).toBeLessThan(0.9);
    expect(offNetworkKm(points)).toBeCloseTo(0.77, 1);
    expect(leg?.ascent).toBe(40);
    expect(leg?.elevation.every((e) => e >= 310 && e <= 350)).toBe(true);
  });
});
