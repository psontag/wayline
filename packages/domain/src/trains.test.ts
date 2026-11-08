import { describe, expect, it } from "vitest";
import {
  connectionNeedsReservation,
  needsReservation,
  preferFewChanges,
} from "./trains";

describe("trains", () => {
  it("marks long-distance lines", () => {
    for (const line of [
      "ICE 591",
      "IC 2063",
      "EC 115",
      "RJX 63",
      "FLX 1",
      "FlixBus N1326",
    ]) {
      expect(needsReservation(line)).toBe(true);
    }
    for (const line of ["RE 10", "RB 27", "S 3", "Bus 12", "ICEBERG"]) {
      expect(needsReservation(line)).toBe(false);
    }
  });

  it("marks a connection with any long-distance leg", () => {
    expect(connectionNeedsReservation({ lines: ["RE 10", "ICE 591"] })).toBe(
      true,
    );
    expect(connectionNeedsReservation({ lines: ["RE 10", "RB 2"] })).toBe(
      false,
    );
  });

  it("prefers at most one change", () => {
    const options = [{ changes: 2 }, { changes: 1 }, { changes: 0 }];
    expect(preferFewChanges(options)).toEqual([{ changes: 1 }, { changes: 0 }]);
    expect(preferFewChanges([{ changes: 3 }])).toEqual([{ changes: 3 }]);
  });
});
