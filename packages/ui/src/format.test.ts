import { describe, expect, it } from "vitest";
import { createFormat } from "./format";

describe("format", () => {
  it("formats dates as in the design", () => {
    expect(createFormat("en").date(new Date(2026, 9, 26))).toBe("Mon 26 Oct");
  });
});

describe("duration", () => {
  const { duration, clock, rain } = createFormat("en");
  it("rounds to 5 minutes", () => {
    expect(duration(4.26)).toBe("4 h 15");
    expect(duration(4)).toBe("4 h");
    expect(duration(0.75)).toBe("45 min");
    expect(duration(2.05)).toBe("2 h 05");
  });
  it("formats clock hours and rain", () => {
    expect(clock(9.5)).toBe("09:30");
    expect(rain(1.25)).toBe("1.3 mm");
  });
});
