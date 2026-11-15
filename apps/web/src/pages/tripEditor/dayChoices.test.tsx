import { describe, expect, it, vi } from "vitest";
import { dayChoiceProps } from "./dayChoices";
import type { OtherWay, OtherWaysState } from "./otherWays";

const way = { id: "p1" } as OtherWay;

function setup(hovered?: string) {
  const hover = { onHover: vi.fn() };
  const ways: OtherWaysState = {
    on: true,
    onSearch: vi.fn(),
    loading: false,
    failed: false,
    ways: [way],
    ...(hovered && { hovered }),
    onHover: vi.fn(),
    onPick: vi.fn(),
  };
  const pickTown = vi.fn();
  return {
    hover,
    ways,
    pickTown,
    props: dayChoiceProps(hover, ways, pickTown),
  };
}

describe("dayChoiceProps", () => {
  it("sends a way's hover to the ways and clears the town", () => {
    const { hover, ways, props } = setup();
    props.onHover?.("way:p1");
    expect(ways.onHover).toHaveBeenCalledWith("p1");
    expect(hover.onHover).toHaveBeenCalledWith(undefined);
  });

  it("sends a town's hover to the towns and clears the way", () => {
    const { hover, ways, props } = setup();
    props.onHover?.("Bug");
    expect(hover.onHover).toHaveBeenCalledWith("Bug");
    expect(ways.onHover).toHaveBeenCalledWith(undefined);
  });

  it("picks a way or a town", () => {
    const { ways, pickTown, props } = setup();
    props.onSelect?.("way:p1");
    expect(ways.onPick).toHaveBeenCalledWith(way);
    props.onSelect?.("Bug");
    expect(pickTown).toHaveBeenCalledWith("Bug");
  });

  it("marks the hovered way", () => {
    expect(setup("p1").props.hoveredId).toBe("way:p1");
  });
});
