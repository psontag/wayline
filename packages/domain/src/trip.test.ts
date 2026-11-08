import { describe, expect, it } from "vitest";
import { tripTitle } from "./trip";

describe("tripTitle", () => {
  it("names one-way trips by start and end", () => {
    expect(tripTitle("Würzburg", "Bamberg")).toBe("Würzburg – Bamberg");
  });

  it("names loops by their start", () => {
    expect(tripTitle("Heidelberg")).toBe("Loop from Heidelberg");
    expect(tripTitle("Heidelberg", "Heidelberg")).toBe("Loop from Heidelberg");
    expect(tripTitle("Heidelberg", undefined, "Wiesloch")).toBe(
      "Loop from Heidelberg via Wiesloch",
    );
  });
});
