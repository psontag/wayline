import { type Area, encodeLine, type ReachRow } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { areaReach, areaShape, areasInReach } from "./areas";
import { defaultReachFilter } from "./reach";

const ring = encodeLine([
  [8, 49],
  [9, 49],
  [9, 50],
]);

function area(id: string, name: string, stations: string[]): Area {
  return {
    id,
    name,
    officialName: name,
    label: [8.5, 49.5],
    bbox: [8, 49, 9, 50],
    outline: [[ring]],
    stations,
    routes: [],
  };
}

// Regional only: direct, 1 change, 2 changes. IC/ICE the same, no reservation.
const row = (direct: number | null, one: number | null): ReachRow => [
  direct,
  one,
  one,
  direct,
  one,
  one,
  0,
];

describe("areas", () => {
  const rows: Record<string, ReachRow> = {
    a: row(90, 80),
    b: row(null, 50),
    c: row(300, 300),
  };
  const areas = [
    area("1", "Pfalz", ["a", "b"]),
    area("2", "Allgäu", ["c"]),
    area("3", "Nordsee", ["x"]),
  ];

  it("takes the fastest station of an area", () => {
    const [pfalz, allgaeu, nordsee] = areaReach(
      areas,
      rows,
      defaultReachFilter,
    );
    expect(pfalz?.reach?.minutes).toBe(50);
    expect(pfalz?.over).toBe(false);
    expect(allgaeu?.reach?.minutes).toBe(300);
    expect(allgaeu?.over).toBe(true);
    expect(nordsee?.reach).toBeUndefined();
    expect(nordsee?.over).toBe(true);
  });

  it("lists areas within the max time, fastest first", () => {
    const all = areaReach(areas, rows, { ...defaultReachFilter, maxHours: 6 });
    expect(areasInReach(all).map((a) => a.area.name)).toEqual([
      "Pfalz",
      "Allgäu",
    ]);
  });

  it("closes the rings of the outline", () => {
    const [polygon] = areaShape(areas[0] as Area).coordinates;
    expect(polygon?.[0]).toEqual([
      [8, 49],
      [9, 49],
      [9, 50],
      [8, 49],
    ]);
  });
});
