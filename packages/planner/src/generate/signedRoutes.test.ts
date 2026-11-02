import type { NetworkEdge, RouteNetwork } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Graph } from "../graph/Graph";
import { Costs } from "./search";
import {
  followedRoute,
  kmOnRoute,
  routeCandidates,
  kmUnused,
  routeLengths,
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

describe("kmUnused", () => {
  it("leaves out used edges", () => {
    expect(kmUnused(graph, named("R"), new Set([0, 2]))).toBe(20);
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
    const list = routeCandidates(graph, costs, 0, 4, named("R"), [1, 2, 3], 8);
    expect(list[0]?.nodes).toEqual([0, 1, 3, 4]);
    expect(list[0]?.km).toBe(40);
  });

  it("limits the vias", () => {
    const list = routeCandidates(graph, costs, 0, 4, named("R"), [1, 2, 3], 2);
    expect(new Set(list.flatMap((c) => c.nodes.slice(1, -1))).size).toBe(2);
  });
});

describe("followedRoute", () => {
  const lengths = routeLengths(graph);
  const steps = (...edges: number[]) =>
    edges.map((edge) => ({ edge, forward: true }));

  it("names a route ridden for most of its length", () => {
    expect(followedRoute(graph, steps(0, 1, 2), lengths, 0.3)).toBe("R");
  });

  it("names no route ridden for half or less", () => {
    expect(followedRoute(graph, steps(0, 1), lengths, 0.3)).toBeUndefined();
  });

  it("needs a share of the path on the route", () => {
    const short = new Map([["R", 15]]);
    expect(followedRoute(graph, steps(0), short, 0.3)).toBe("R");
    expect(followedRoute(graph, steps(0), short, 1.1)).toBeUndefined();
  });
});
