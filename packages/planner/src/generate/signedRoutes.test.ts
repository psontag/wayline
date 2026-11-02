import type { NetworkEdge, RouteInfo, RouteNetwork } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Graph } from "../graph/Graph";
import { RouteCatalog } from "./routeCatalog";
import { Costs } from "./search";
import {
  followedRoute,
  kmOnRoute,
  routeCandidates,
  kmUnused,
  routesInReach,
} from "./signedRoutes";

// Five nodes in a row, 10 km apart, on route R. The last two edges are also on S.
const edges: Partial<NetworkEdge>[] = [
  { from: 0, to: 1, routes: ["Route R"] },
  { from: 1, to: 2, routes: ["Route R"] },
  { from: 2, to: 3, routes: ["Route R", "Route S"] },
  { from: 3, to: 4, routes: ["Route R", "Route S"] },
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
const catalog = new RouteCatalog(graph.edges);
const named = (name: string) => {
  const route = routesInReach(graph, catalog, () => true).find(
    (r) => r.name === name,
  );
  if (!route) throw new Error(name);
  return route;
};

describe("routesInReach", () => {
  it("groups edges by route name", () => {
    expect(named("Route R").edges.size).toBe(4);
    expect(named("Route S").edges.size).toBe(2);
  });

  it("leaves out edges out of reach", () => {
    const routes = routesInReach(graph, catalog, (n) => n < 3);
    expect(routes.map((r) => r.name)).toEqual(["Route R"]);
    expect(routes[0]?.edges.size).toBe(2);
  });

  it("groups sections and leaves out non-routes", () => {
    const parts = new Graph({
      ...network,
      edges: network.edges.map((e) => ({
        ...e,
        routes: [e.id < 2 ? "Way One Teil 1" : "Way One Teil 2", "10-11"],
      })),
    });
    const routes = routesInReach(parts, new RouteCatalog(parts.edges), () => true);
    expect(routes.map((r) => r.name)).toEqual(["Way One"]);
    expect(routes[0]?.edges.size).toBe(4);
  });
});

describe("kmUnused", () => {
  it("leaves out used edges", () => {
    expect(kmUnused(graph, named("Route R"), new Set([0, 2]))).toBe(20);
  });
});

describe("kmOnRoute", () => {
  it("counts only steps on the route", () => {
    const steps = [0, 2].map((edge) => ({ edge, forward: true }));
    expect(kmOnRoute(graph, steps, named("Route S"))).toBe(10);
  });
});

describe("routeCandidates", () => {
  const costs = new Costs(graph, { kmPerDay: 40, maxAscentPerDay: 1000 });

  it("rides between two vias, longest ride first", () => {
    const list = routeCandidates(graph, costs, 0, 4, named("Route R"), [1, 2, 3], 8);
    expect(list[0]?.nodes).toEqual([0, 1, 3, 4]);
    expect(list[0]?.km).toBe(40);
  });

  it("limits the vias", () => {
    const list = routeCandidates(graph, costs, 0, 4, named("Route R"), [1, 2, 3], 2);
    expect(new Set(list.flatMap((c) => c.nodes.slice(1, -1))).size).toBe(2);
  });

  it("without an end, goes on to a station near the last via", () => {
    const stations = new Graph({
      ...network,
      nodes: network.nodes.map((n) =>
        n.id === 4 ? { ...n, kind: "station" } : n,
      ),
    });
    const route = routesInReach(stations, catalog, () => true)[0];
    if (!route) throw new Error("no route");
    const c = new Costs(stations, { kmPerDay: 40, maxAscentPerDay: 1000 });
    // Node 4 is about 7 km from node 3, too far for node 1 and 2.
    const list = routeCandidates(stations, c, 0, undefined, route, [1, 3], 8);
    expect(list).toEqual([]);
    const near = routeCandidates(stations, c, 0, undefined, route, [1, 4], 8);
    expect(near[0]?.nodes).toEqual([0, 1, 4]);
  });
});

describe("followedRoute", () => {
  const steps = (...edges: number[]) =>
    edges.map((edge) => ({ edge, forward: true }));

  it("names the route with the most km on the path", () => {
    expect(followedRoute(graph, steps(1, 2), catalog, 0.5)).toBe("Route R");
  });

  it("does not need most of the route", () => {
    expect(followedRoute(graph, steps(0), catalog, 0.5)).toBe("Route R");
  });

  it("needs a share of the path on the route", () => {
    const off = new Graph({
      ...network,
      edges: network.edges.map((e) =>
        e.id > 0 ? { ...e, routes: [] } : e,
      ),
    });
    const offCatalog = new RouteCatalog(off.edges);
    expect(followedRoute(off, steps(0, 1), offCatalog, 0.5)).toBe("Route R");
    expect(followedRoute(off, steps(0, 1, 2), offCatalog, 0.5)).toBeUndefined();
  });

  it("takes the more important route on a tie", () => {
    const both = new Graph({
      ...network,
      edges: network.edges.map((e) => ({
        ...e,
        routes: ["Route L", "Route N"],
      })),
    });
    const ranked = new RouteCatalog(both.edges, [
      { name: "Route L", network: "lcn" },
      { name: "Route N", network: "ncn" },
    ] as RouteInfo[]);
    expect(followedRoute(both, steps(0, 1), ranked, 0.5)).toBe("Route N");
  });
});
