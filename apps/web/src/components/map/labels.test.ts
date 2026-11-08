import { describe, expect, it } from "vitest";
import { centerBox, labelBox, overlaps, placeLabels } from "./labels";

describe("placeLabels", () => {
  it("keeps labels that don't touch", () => {
    const cut = placeLabels([
      { id: "a", priority: 0, box: labelBox(0, 0, 10, 5) },
      { id: "b", priority: 1, box: labelBox(0, 100, 10, 5) },
    ]);
    expect(cut.size).toBe(0);
  });

  it("hides the lower priority marker, whatever the order", () => {
    const cut = placeLabels([
      { id: "route", priority: 3, box: centerBox(20, 0, 24) },
      { id: "stop", priority: 1, box: labelBox(0, 0, 16, 8) },
    ]);
    expect([...cut]).toEqual([["route", "none"]]);
  });

  it("drops the label of a crowded marker, keeping its core", () => {
    // A choice just below left of the stop, its name running into the stop's.
    const cut = placeLabels([
      {
        id: "stop",
        priority: 0,
        box: labelBox(0, 0, 16, 10),
        core: labelBox(0, 0, 16),
        fixed: true,
      },
      {
        id: "choice",
        priority: 1,
        box: labelBox(-40, 20, 8, 10),
        core: labelBox(-40, 20, 8),
        fixed: true,
      },
      {
        id: "hotel",
        priority: 2,
        box: centerBox(-40, 20, 44, 22),
        core: centerBox(-40, 20, 20),
      },
    ]);
    expect(cut).toEqual(
      new Map([
        ["choice", "core"],
        ["hotel", "none"],
      ]),
    );
  });

  it("keeps labels off fixed cores, even of lower priority", () => {
    // Stop 2 sits on the name of stop 1, so stop 1 loses its name.
    const cut = placeLabels([
      {
        id: "stop1",
        priority: 1,
        box: labelBox(0, 0, 16, 12),
        core: labelBox(0, 0, 16),
        fixed: true,
      },
      {
        id: "stop2",
        priority: 2,
        box: labelBox(60, 0, 16, 12),
        core: labelBox(60, 0, 16),
        fixed: true,
      },
    ]);
    expect(cut).toEqual(new Map([["stop1", "core"]]));
  });
});

describe("labelBox", () => {
  it("grows to the right with the text", () => {
    const box = labelBox(100, 50, 10, 4, 5);
    expect(box).toEqual({ left: 90, right: 136, top: 40, bottom: 60 });
    expect(overlaps(box, centerBox(130, 50, 4))).toBe(true);
    expect(overlaps(box, centerBox(140, 50, 4))).toBe(false);
  });
});
