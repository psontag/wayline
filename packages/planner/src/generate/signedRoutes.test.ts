import type { NetworkEdge, RouteNetwork } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Graph } from "../graph/Graph";
import { Costs } from "./search";
import {
  kmOnRoute,
  routeCandidates,
  routeExtent,
  routesInReach,
} from "./signedRoutes";

// Five nodes in a row, 10 km apart, on route R. The last two edges are also on S.
const edges: Partial<NetworkEdge>[] = [
  { from: 0, to: 1, routes: ["R"] },
  { from: 1, to: 2, routes: ["R"] },
  { from: 2, to: 3, routes: ["R", "S"] },
  { from: 3, to: 4, routes: ["R", "S"] },
];
const network: RouteNetwork = {
  version: "t",
  nodes: [0, 1, 2, 3, 4].map((id) => ({
    id,
    lon: 9 + id / 10,
    lat: 49,
    kind: "town",
    hotelCount: 1,
  })),
  edges: edges.map(
    (e, id) =>
      ({
        id,
        lengthKm: 10,
        pavedShare: 1,
        surface: { paved: 1, gravel: 0, unpaved: 0 },
        network: "rcn",
        score: 0.85,
        ascent: 0,
        descent: 0,
        geometry: "",
        elevation: [],
        ...e,
      }) as NetworkEdge,
  ),
};
const graph = new Graph(network);
const named = (name: string) => {
  const route = routesInReach(graph, () => true).find((r) => r.name === name);
  if (!route) throw new Error(name);
  return route;
};

describe("routesInReach", () => {
  it("groups edges by route name", () => {
    expect(named("R").edges.size).toBe(4);
    expect(named("S").edges.size).toBe(2);
  });

  it("leaves out edges out of reach", () => {
    const routes = routesInReach(graph, (n) => n < 3);
    expect(routes.map((r) => r.name)).toEqual(["R"]);
    expect(routes[0]?.edges.size).toBe(2);
  });
});

describe("routeExtent", () => {
  it("gives the km and the middle", () => {
    const { km, middle } = routeExtent(graph, named("S"));
    expect(km).toBe(20);
    expect(middle[0]).toBeCloseTo(9.25);
  });
});

describe("kmOnRoute", () => {
  it("counts only steps on the route", () => {
    const steps = [0, 2].map((edge) => ({ edge, forward: true }));
    expect(kmOnRoute(graph, steps, named("S"))).toBe(10);
  });
});

describe("routeCandidates", () => {
  const costs = new Costs(graph, { kmPerDay: 40, maxAscentPerDay: 1000 });

  it("rides between two vias, longest ride first", () => {
    const list = routeCandidates(
      graph,
      costs,
      0,
      4,
      named("R"),
      [1, 2, 3],
      40,
      8,
    );
    expect(list[0]?.nodes).toEqual([0, 1, 3, 4]);
  });

  it("drops candidates of the wrong length", () => {
    const list = routeCandidates(
      graph,
      costs,
      0,
      4,
      named("R"),
      [1, 2, 3],
      200,
      8,
    );
    expect(list).toEqual([]);
  });

  it("limits the vias", () => {
    const list = routeCandidates(
      graph,
      costs,
      0,
      4,
      named("R"),
      [1, 2, 3],
      40,
      2,
    );
    expect(new Set(list.flatMap((c) => c.nodes.slice(1, -1))).size).toBe(2);
  });
});
