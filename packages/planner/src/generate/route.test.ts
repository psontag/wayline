import type { NetworkEdge, RouteNetwork } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Graph } from "../graph/Graph";
import { legSteps } from "./route";

const KM = 1 / 111.195;

/** A path through the points, one edge of 1 km per step, with x and y in km. */
function path(points: [number, number][]) {
  const network: RouteNetwork = {
    version: "t",
    nodes: points.map(([x, y], id) => ({
      id,
      lon: x * KM,
      lat: y * KM,
      kind: "junction",
      hotelCount: 0,
    })),
    edges: points.slice(1).map(
      (_, id) =>
        ({
          id,
          from: id,
          to: id + 1,
          lengthKm: 1,
          surface: { paved: 1, gravel: 0, unpaved: 0 },
          geometry: "",
          elevation: [],
        }) as unknown as NetworkEdge,
    ),
  };
  const graph = new Graph(network);
  const steps = network.edges.map((e) => ({ edge: e.id, forward: true }));
  return legSteps(graph, steps).map((p) => p.length);
}

describe("legSteps", () => {
  it("cuts a straight path about every 10 km", () => {
    const line = Array.from({ length: 25 }, (_, i): [number, number] => [i, 0]);
    expect(path(line)).toEqual([10, 14]);
  });

  it("cuts where the path turns back", () => {
    const u: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [2, 1],
      [1, 1],
      [0, 1],
    ];
    expect(path(u)).toEqual([4, 3]);
  });
});
