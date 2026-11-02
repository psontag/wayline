import { describe, expect, it } from "vitest";
import { routeColorAt } from "./routeColor";

describe("routeColorAt", () => {
  it("gives each proposal its own color, then starts over", () => {
    const colors = Array.from({ length: 8 }, (_, i) => routeColorAt(i));
    expect(new Set(colors).size).toBe(8);
    expect(routeColorAt(8)).toBe(colors[0]);
  });
});
