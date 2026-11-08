import type { Place } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { nearestPlace } from "./places";

const town = (name: string, lon: number, lat: number): Place => ({
  name,
  kind: "town",
  coord: [lon, lat],
});

describe("nearestPlace", () => {
  const list = [town("Würzburg", 9.93, 49.79), town("Bamberg", 10.89, 49.89)];

  it("picks the nearest place", () => {
    expect(nearestPlace(list, [9.95, 49.8])?.name).toBe("Würzburg");
    expect(nearestPlace(list, [10.8, 49.9])?.name).toBe("Bamberg");
  });

  it("prefers the more important place close by", () => {
    const withVillage = [...list, town("Randersacker", 9.98, 49.76)];
    const at: [number, number] = [9.98, 49.765];
    expect(nearestPlace(withVillage, at)?.name).toBe("Randersacker");
    expect(nearestPlace(withVillage, at, 8)?.name).toBe("Würzburg");
  });

  it("picks nothing far from any place", () => {
    expect(nearestPlace(list, [10.4, 49.85])).toBeUndefined();
  });
});
