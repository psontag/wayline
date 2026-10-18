import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./index";

describe("SCHEMA_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
