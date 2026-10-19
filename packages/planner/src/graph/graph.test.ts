import {
  decodeLine,
  encodeLine,
  type NetworkEdge,
  type RouteNetwork,
} from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { dijkstra, Graph, pathToLeg, shortestPath } from "./index";

// Square with a nice long way (0-1-2) and a short ugly way (0-3-2).
//   1 ---- 2
//   |      |
//   0 ---- 3
const nodes = [
  [11.0, 50.0],
  [11.0, 50.1],
  [11.1, 50.1],
  [11.1, 50.0],
].map(([lon, lat], id) => ({
  id,
  lon: lon!,
  lat: lat!,
  kind: "junction" as const,
  hotelCount: 0,
}));

function edge(
  id: number,
  from: number,
  to: number,
  over: Partial<NetworkEdge> = {},
): NetworkEdge {
  const a = nodes[from]!;
  const b = nodes[to]!;
  return {
    id,
    from,
    to,
    lengthKm: 10,
    pavedShare: 1,
    surface: { paved: 1, gravel: 0, unpaved: 0 },
    network: "rcn",
    routes: [],
    score: 1,
    ascent: 20,
    descent: 5,
    geometry: encodeLine([
      [a.lon, a.lat],
      [b.lon, b.lat],
    ]),
    elevation: [300, 315],
    ...over,
  };
}

const network: RouteNetwork = {
  version: "test",
  nodes,
  edges: [
    edge(0, 0, 1),
    edge(1, 1, 2),
    edge(2, 0, 3, { lengthKm: 8, score: 0.4 }),
    edge(3, 2, 3, {
      lengthKm: 8,
      score: 0.4,
      surface: { paved: 0, gravel: 1, unpaved: 0 },
    }),
  ],
};
const graph = new Graph(network);

describe("Graph", () => {
  it("finds the nearest node", () => {
    expect(graph.nearestNode([11.09, 50.09])).toBe(2);
    expect(graph.nearestNode([12, 51])).toBeUndefined();
    expect(
      graph.nearestNode([11.09, 50.09], {
        maxKm: 10,
        filter: (n) => n.id !== 2,
      }),
    ).toBe(1);
  });

  it("lists nodes within a radius, nearest first", () => {
    expect(graph.nodesWithin([11.0, 50.0], 12)).toEqual([0, 3, 1]);
  });

  it("reverses edge lines", () => {
    const line = graph.edgeLine(0, false);
    expect(line.coords[0]).toEqual([11.0, 50.1]);
    expect(line.elevation).toEqual([315, 300]);
  });
});

describe("dijkstra", () => {
  it("prefers nice edges over short ones", () => {
    const steps = shortestPath(graph, 0, 2);
    expect(steps).toEqual([
      { edge: 0, forward: true },
      { edge: 1, forward: true },
    ]);
  });

  it("takes a custom cost", () => {
    const steps = shortestPath(graph, 2, 0, (e) => e.lengthKm);
    expect(steps).toEqual([
      { edge: 3, forward: true },
      { edge: 2, forward: false },
    ]);
  });

  it("returns km and null for unreachable nodes", () => {
    const g = new Graph({ ...network, edges: network.edges.slice(0, 1) });
    const result = dijkstra(g, 0);
    expect(result.km[1]).toBe(10);
    expect(shortestPath(g, 0, 2)).toBeNull();
  });
});

describe("pathToLeg", () => {
  it("joins edges and swaps climbing on reversed edges", () => {
    const steps = shortestPath(graph, 2, 0, (e) => e.lengthKm)!;
    const leg = pathToLeg(graph, steps, [11.1, 50.1], [11.0, 49.99], {
      provider: "fake",
      profileHash: "touring",
    });
    // Edge 3 forward (20 up, 5 down), edge 2 reversed (5 up, 20 down).
    expect(leg.ascent).toBe(25);
    expect(leg.descent).toBe(25);
    expect(decodeLine(leg.geometry)).toHaveLength(4);
    expect(leg.elevation).toHaveLength(4);
    expect(leg.distance).toBeGreaterThan(16_000);
    expect(leg.surface.gravel).toBeCloseTo(8 / (leg.distance / 1000), 2);
  });
});
