import type { NetworkEdge, RouteInfo } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { cleanRouteName, RouteCatalog } from "./routeCatalog";
import names from "./routeNames.json";

// Shared with pipeline/route_stations.py.
describe("cleanRouteName", () => {
  it.each(names.clean)("cleans %s", (name, clean) => {
    expect(cleanRouteName(name)).toBe(clean);
  });

  it.each(names.drop)("drops %s", (name) => {
    expect(cleanRouteName(name)).toBeUndefined();
  });
});

describe("RouteCatalog", () => {
  const edge = (id: number, routes: string[]) =>
    ({ id, routes, network: "icn" }) as NetworkEdge;
  const info = (name: string, network: RouteInfo["network"]) =>
    ({ name, network }) as RouteInfo;

  it("names each route on an edge once and drops non-routes", () => {
    const catalog = new RouteCatalog([]);
    const e = edge(0, ["Main-Radweg Teil 1", "Main-Radweg Teil 2", "1-2"]);
    expect(catalog.on(e)).toEqual(["Main-Radweg"]);
  });

  it("takes the class of the route, not of its edges", () => {
    const table = [info("County Way", "lcn"), info("Big Way", "ncn")];
    const catalog = new RouteCatalog([edge(0, ["County Way"])], table);
    expect(catalog.rank("Big Way")).toBeLessThan(catalog.rank("County Way"));
  });

  it("takes the best class of the sections", () => {
    const table = [
      info("Long Way Teil 1", "lcn"),
      info("Long Way Teil 2", "ncn"),
    ];
    const other = [info("Other Way", "rcn")];
    const catalog = new RouteCatalog([], [...table, ...other]);
    expect(catalog.rank("Long Way")).toBeLessThan(catalog.rank("Other Way"));
  });

  it("falls back on the edges without a table", () => {
    const catalog = new RouteCatalog([edge(0, ["Some Way"])]);
    expect(catalog.rank("Some Way")).toBe(0);
  });
});
