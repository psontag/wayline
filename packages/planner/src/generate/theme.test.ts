import type { NetworkEdge, RouteNetwork } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Graph } from "../graph/Graph";
import { themeBoost, themeShare, themeValue } from "./theme";

const scenery = {
  forest: 0.2,
  water: 0.6,
  vineyard: 0.25,
  nature: 0.5,
  sights: 3,
};

function edge(id: number, lengthKm: number, s = scenery): NetworkEdge {
  return {
    id,
    from: id,
    to: id + 1,
    lengthKm,
    pavedShare: 1,
    surface: { paved: 1, gravel: 0, unpaved: 0 },
    network: "rcn",
    routes: [],
    score: 0.8,
    ascent: 0,
    descent: 0,
    geometry: "",
    elevation: [],
    scenery: s,
  } as NetworkEdge;
}

describe("themes", () => {
  it("measures how well an edge fits", () => {
    const e = edge(0, 4);
    expect(themeShare(e, "nature")).toBe(0.5);
    expect(themeShare(e, "water")).toBe(0.6);
    expect(themeShare(e, "wine")).toBe(1);
    // 3 sights on 4 km: more than one every 2 km.
    expect(themeShare(e, "culture")).toBe(1);
  });

  it("leaves edges without data and requests without a theme alone", () => {
    const plain = { ...edge(0, 4), scenery: undefined };
    expect(themeShare(plain, "water")).toBe(0);
    expect(themeBoost(edge(0, 4))).toBe(1);
    expect(themeBoost(edge(0, 4), "water")).toBeGreaterThan(1);
  });

  it("sums a path as a share of km", () => {
    const dry = { ...scenery, water: 0, sights: 1 };
    const network: RouteNetwork = {
      version: "t",
      nodes: [0, 1, 2].map((id) => ({
        id,
        lon: id,
        lat: 0,
        kind: "junction",
        hotelCount: 0,
      })),
      edges: [edge(0, 10), edge(1, 30, dry)],
    };
    const steps = [
      { edge: 0, forward: true },
      { edge: 1, forward: true },
    ];
    const graph = new Graph(network);
    expect(themeValue(graph, steps, "water")).toBeCloseTo(0.15);
    expect(themeValue(graph, steps, "culture")).toBe(1);
    expect(themeValue(graph, steps, "wine")).toBeCloseTo(0.25);
  });
});
