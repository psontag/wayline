import type {
  GenerateRequest,
  NetworkEdge,
  RouteNetwork,
  Scenery,
  Trip,
} from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Graph } from "../graph/Graph";
import { routeTags } from "./tags";

const none: Scenery = {
  forest: 0,
  water: 0,
  vineyard: 0,
  nature: 0,
  sights: 0,
};

function graphOf(edge: Partial<NetworkEdge>) {
  const network: RouteNetwork = {
    version: "t",
    nodes: [0, 1].map((id) => ({
      id,
      lon: id,
      lat: 0,
      kind: "junction",
      hotelCount: 0,
    })),
    edges: [
      {
        id: 0,
        from: 0,
        to: 1,
        lengthKm: 100,
        pavedShare: 1,
        surface: { paved: 1, gravel: 0, unpaved: 0 },
        network: "rcn",
        routes: ["R"],
        score: 0.85,
        ascent: 0,
        descent: 0,
        geometry: "",
        elevation: [],
        scenery: none,
        ...edge,
      } as NetworkEdge,
    ],
  };
  return new Graph(network);
}

const request = {
  kmPerDay: 100,
  maxAscentPerDay: 1000,
} as GenerateRequest;

function trip(km: number, ascent: number) {
  return {
    stages: [{ stats: { distance: km * 1000, ascent } }],
  } as unknown as Trip;
}

function tags(
  edge: Partial<NetworkEdge>,
  km = 100,
  ascent = 300,
  urban = new Set<number>(),
  target: number | null = 100,
) {
  const steps = [{ edge: 0, forward: true }];
  return routeTags(
    graphOf(edge),
    steps,
    trip(km, ascent),
    urban,
    request,
    target ?? undefined,
  );
}

describe("routeTags", () => {
  it("tags landscape by share of km", () => {
    expect(tags({ scenery: { ...none, forest: 0.6 } })).toContain("nature");
    expect(tags({ scenery: { ...none, forest: 0.4 } })).not.toContain("nature");
    expect(tags({ scenery: { ...none, water: 0.4 } })).toContain("water");
    expect(tags({ scenery: { ...none, vineyard: 0.05 } })).toContain("wine");
    expect(tags({ scenery: { ...none, sights: 1 } })).toContain("sights");
  });

  it("tags towns from the urban nodes", () => {
    expect(tags({}, 100, 300, new Set([0, 1]))).toContain("urban");
    expect(tags({}, 100, 300, new Set([0]))).not.toContain("urban");
  });

  it("needs two landscapes and quiet ways for scenic", () => {
    const both = { ...none, forest: 0.6, water: 0.5 };
    expect(tags({ scenery: both })).toContain("scenic");
    expect(tags({ scenery: { ...none, forest: 0.6 } })).not.toContain("scenic");
    expect(tags({ scenery: both, score: 0.6 })).not.toContain("scenic");
    expect(tags({ scenery: both }, 100, 300, new Set([0, 1]))).not.toContain(
      "scenic",
    );
  });

  it("tags the kind of way", () => {
    expect(tags({})).toContain("quiet");
    expect(tags({ score: 0.85 * 0.85 })).toContain("gravel");
    expect(tags({ score: 0.85 * 0.7 })).toContain("mainRoads");
    expect(tags({ routes: [] })).toContain("offRoutes");
    expect(tags({})).not.toContain("offRoutes");
  });

  it("tags climbing per km", () => {
    expect(tags({}, 100, 100)).toContain("flat");
    expect(tags({}, 100, 300)).not.toContain("flat");
    expect(tags({}, 100, 700)).not.toContain("hilly");
    expect(tags({}, 200, 1600)).toContain("hilly");
    expect(tags({}, 200, 2400)).toContain("climbs");
    expect(tags({}, 200, 2400)).not.toContain("hilly");
  });

  it("tags hilly when a day comes close to the max ascent", () => {
    expect(tags({}, 200, 900)).toContain("hilly");
    expect(tags({}, 200, 850)).not.toContain("hilly");
  });

  it("says when a route leaves the inputs", () => {
    expect(tags({}, 110)).toContain("longer");
    expect(tags({}, 89)).toContain("shorter");
    expect(tags({}, 105)).not.toContain("longer");
    expect(tags({}, 100, 1040)).not.toContain("moreClimbing");
    expect(tags({}, 100, 1100)).toContain("moreClimbing");
  });

  it("has no length tags without a target", () => {
    expect(tags({}, 200, 300, new Set(), null)).not.toContain("longer");
  });
});
