import type { LonLat } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { clusterPoints } from "./cluster";

// One degree is 100 pixels.
const project = ([lon, lat]: LonLat) => ({ x: lon * 100, y: -lat * 100 });

describe("clusterPoints", () => {
  it("groups close items and keeps far ones alone", () => {
    const items = [
      { id: "a", coord: [10, 50] as LonLat },
      { id: "b", coord: [10.2, 50] as LonLat },
      { id: "c", coord: [11, 50] as LonLat },
    ];
    const clusters = clusterPoints(items, project, 40);
    expect(clusters.map((c) => c.items.map((i) => i.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(clusters[0]!.coord[0]).toBeCloseTo(10.1);
    expect(clusters[1]!.coord).toEqual([11, 50]);
  });

  it("puts each item in one cluster only", () => {
    const items = [0, 0.3, 0.6, 0.9].map((lon) => ({
      coord: [lon, 0] as LonLat,
    }));
    const clusters = clusterPoints(items, project, 40);
    expect(clusters.flatMap((c) => c.items)).toHaveLength(4);
  });
});
