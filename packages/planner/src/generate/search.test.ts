import { describe, expect, it } from "vitest";
import { bboxAround } from "@wayline/domain";
import { TiledNetworkSource } from "@wayline/providers";
import { readDataFile } from "@wayline/providers/testing";
import { AreaCache } from "../graph/area";
import { dijkstra, pathTo, shortestPath } from "../graph/dijkstra";
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
      const search = dijkstra(graph, 0, { target: b, cost: costs.cost() });
      expect(costs.pathFrom(graph, 0, b)).toEqual(pathTo(graph, search, b));
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

describe("shortestPath", () => {
  it("costs the same as a search from one end", async () => {
    const graph = await new AreaCache(
      new TiledNetworkSource(readDataFile, "/data/mock/heidelberg"),
      (n) => new Graph(n),
    ).get(bboxAround([[8.675, 49.403]], 20));
    const costs = new Costs(graph, { kmPerDay: 70, maxAscentPerDay: 900 });
    // Some penalties, as after a few picks.
    for (let e = 0; e < graph.edges.length; e += 7) costs.penalty[e] = 2;
    const weights = costs.cost();
    const costOf = (steps: { edge: number }[]) =>
      steps.reduce(
        (sum, s) =>
          sum + (weights.base[s.edge] ?? 0) * (weights.factor?.[s.edge] ?? 1),
        0,
      );
    const n = graph.nodes.length;
    for (let i = 0; i < 50; i++) {
      const a = (i * 7919) % n;
      const b = (i * 104729 + 13) % n;
      const one = dijkstra(graph, a, { target: b, cost: weights });
      const path = shortestPath(graph, a, b, weights);
      if (one.cost[b] === Infinity) {
        expect(path).toBeNull();
        continue;
      }
      expect(path).not.toBeNull();
      expect(costOf(path!)).toBeCloseTo(one.cost[b]!, 6);
      // A connected chain from a to b.
      let node = a;
      for (const s of path!) {
        const e = graph.edge(s.edge);
        expect(s.forward ? e.from : e.to).toBe(node);
        node = s.forward ? e.to : e.from;
      }
      expect(node).toBe(b);
    }
  });
});
