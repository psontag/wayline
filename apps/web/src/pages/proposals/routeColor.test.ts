import { describe, expect, it } from "vitest";
import { proposalLetter, routeColorAt } from "./routeColor";

describe("routeColorAt", () => {
  it("gives each proposal its own color, then starts over", () => {
    const colors = Array.from({ length: 8 }, (_, i) => routeColorAt(i));
    expect(new Set(colors).size).toBe(8);
    expect(routeColorAt(8)).toBe(colors[0]);
  });
});

describe("proposalLetter", () => {
  it("names proposals A, B, C", () => {
    expect([0, 1, 2].map(proposalLetter)).toEqual(["A", "B", "C"]);
  });
});
