import type { LonLat } from "@wayline/domain";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { dayChoices } from "./dayChoices";
import type { OtherWay } from "./otherWays";
import type { StopChoice } from "./stopChoices";

const t = ((key: string) => key) as unknown as TFunction<
  ["tripEditor", "proposals"]
>;
const line: LonLat[] = [
  [10, 50],
  [10.1, 50],
];

const town = (name: string, km: number, current = false) =>
  ({
    place: { name, kind: "town", coord: [10, 50] },
    current,
    distance: km * 1000,
    ascent: 100,
    nextDistance: (150 - km) * 1000,
    beds: { total: km },
    line,
    nextLine: line,
  }) as StopChoice;

const way = (id: string, km: number, via = id) =>
  ({
    id,
    tags: [],
    via: [via],
    stage: { via: [], legs: [], stats: { distance: km * 1000, ascent: 300 } },
    line,
  }) as unknown as OtherWay;

describe("dayChoices", () => {
  const towns = [town("Now", 80, true), town("Near", 70), town("Far", 95)];

  it("lists towns and ways by today's km", () => {
    const list = dayChoices(t, towns, [way("a", 85)]);
    expect(list.map((c) => c.id)).toEqual(["Near", "Now", "way:a", "Far"]);
  });

  it("keeps the town colors when ways arrive", () => {
    const before = dayChoices(t, towns, []);
    const after = dayChoices(t, towns, [way("a", 85)]);
    const colors = (list: typeof before) =>
      Object.fromEntries(list.map((c) => [c.id, c.color]));
    expect(colors(after)).toMatchObject(colors(before));
    expect(colors(before).Now).toBeUndefined();
    expect(new Set(Object.values(colors(after))).size).toBe(4);
  });

  it("keeps tomorrow and the hotels for a way", () => {
    const [w] = dayChoices(t, towns, [way("a", 85)]).filter(
      (c) => c.kind === "way",
    );
    expect(w).toMatchObject({ nextDistance: 70_000, hotels: 80 });
    expect(w?.nextLine).toBeUndefined();
    expect(w?.stages?.next).toBeUndefined();
  });

  it("shows ways with the same name once", () => {
    const list = dayChoices(t, towns, [
      way("a", 85, "Forchheim"),
      way("b", 99, "Forchheim"),
    ]);
    expect(list.filter((c) => c.kind === "way").map((c) => c.id)).toEqual([
      "way:a",
    ]);
  });

  it("shows ways with the same km and climbing once", () => {
    const list = dayChoices(t, towns, [way("a", 85), way("previous", 85)]);
    expect(list.filter((c) => c.kind === "way").map((c) => c.id)).toEqual([
      "way:a",
    ]);
  });
});
