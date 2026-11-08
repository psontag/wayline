import { describe, expect, it } from "vitest";
import { bboxAround } from "@wayline/domain";
import { TiledNetworkSource } from "@wayline/providers";
import { readDataFile } from "@wayline/providers/testing";
import { AreaCache } from "../graph/area";
import { shortestPath } from "../graph/dijkstra";
import { Graph } from "../graph/Graph";
import { Costs, type End, spreadEnds } from "./search";

describe("spreadEnds", () => {
  it("keeps the nicest end per direction and distance", () => {
    const ends: End[] = [
      { end: 1, straight: 100, bearing: 2, rate: 3 },
      { end: 2, straight: 110, bearing: 5, rate: 2 },
      { end: 3, straight: 30, bearing: 5, rate: 9 },
      { end: 4, straight: 100, bearing: 180, rate: 5 },
    ];
    expect(spreadEnds(ends, 200).map((e) => e.end)).toEqual([2, 3, 4]);
  });
});

describe("Costs.pathFrom", () => {
  const graphOf = () =>
    new AreaCache(
      new TiledNetworkSource(readDataFile, "/data/mock/heidelberg"),
      (n) => new Graph(n),
    ).get(bboxAround([[8.675, 49.403]], 20));
  const request = { kmPerDay: 70, maxAscentPerDay: 900 };

  it("gives the same path as a search", async () => {
    const graph = await graphOf();
    const costs = new Costs(graph, request);
    costs.from(graph, 0);
    for (let b = 1; b < graph.nodes.length; b += 97) {
      expect(costs.pathFrom(graph, 0, b)).toEqual(
        shortestPath(graph, 0, b, costs.cost()),
      );
    }
  });

  it("is not used from another node or after penalties changed", async () => {
    const graph = await graphOf();
    const costs = new Costs(graph, request);
    costs.from(graph, 0);
    expect(costs.pathFrom(graph, 1, 5)).toBeUndefined();
    costs.penalty[0] = 2;
    expect(costs.pathFrom(graph, 0, 5)).toBeUndefined();
  });
});
