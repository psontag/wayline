import { describe, expect, it } from "vitest";
import { createFormat } from "./format";

describe("format", () => {
  it("formats dates as in the design", () => {
    expect(createFormat("en").date(new Date(2026, 9, 26))).toBe("Mon 26 Oct");
  });
});
