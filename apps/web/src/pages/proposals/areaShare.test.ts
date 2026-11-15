import type { MultiPolygon } from "geojson";
import { describe, expect, it } from "vitest";
import { inArea } from "./areaShare";

// A square from 0 to 10 with a hole from 4 to 6.
const area: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  ],
};

describe("inArea", () => {
  it("tells inside, outside and holes apart", () => {
    expect(inArea([2, 2], area)).toBe(true);
    expect(inArea([12, 2], area)).toBe(false);
    expect(inArea([5, 5], area)).toBe(false);
  });
});
