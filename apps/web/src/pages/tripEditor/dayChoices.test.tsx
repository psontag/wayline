import type { LonLat } from "@wayline/domain";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { dayChoices } from "./dayChoices";
import type { DayRoute } from "./dayRoutes";
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
    ascent: 400,
    nextDistance: (150 - km) * 1000,
    beds: { total: km },
    line,
    nextLine: line,
  }) as StopChoice;

const stage = (end: string, km: number, ascent = 400) => ({
  end: { name: end, coord: [10, 50] },
  via: [],
  legs: [],
  stats: { distance: km * 1000, ascent },
});

/** A route to the current stop, or to another town with `end`. */
const route = (
  id: string,
  km: number,
  {
    via = id,
    end,
    ascent,
  }: { via?: string; end?: string; ascent?: number } = {},
) =>
  ({
    id,
    tags: [],
    via: [via],
    stages: end
      ? { stage: stage(end, km, ascent), next: stage("Tomorrow", 60) }
      : { stage: stage("Now", km, ascent) },
    line,
  }) as unknown as DayRoute;

describe("dayChoices", () => {
  const now = [town("Now", 80, true)];

  it("lists the day and the routes by today's km", () => {
    const list = dayChoices(t, now, [
      route("a", 95),
      route("b", 70, { end: "Near" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["route:b", "Now", "route:a"]);
  });

  it("names a route after its town, else by the way", () => {
    const list = dayChoices(t, now, [
      route("a", 95, { via: "Forchheim" }),
      route("b", 70, { end: "Near" }),
    ]);
    expect(list.find((c) => c.id === "route:a")?.name).toBe("dayRoutes.via");
    expect(list.find((c) => c.id === "route:b")?.name).toBe("Near");
  });

  it("keeps the current colors when routes arrive", () => {
    const towns = [...now, town("Station", 85)];
    const before = dayChoices(t, towns, []);
    const after = dayChoices(t, towns, [route("a", 95)]);
    const colors = (list: typeof before) =>
      Object.fromEntries(list.map((c) => [c.id, c.color]));
    expect(colors(after)).toMatchObject(colors(before));
    expect(colors(before).Now).toBeUndefined();
  });

  it("keeps tomorrow and the hotels for a route to the same stop", () => {
    const [r] = dayChoices(t, now, [route("a", 85)]).filter((c) => !c.current);
    expect(r).toMatchObject({ kind: "way", nextDistance: 70_000, hotels: 80 });
    expect(r?.stages?.next).toBeUndefined();
  });

  it("shows tomorrow and the hotels of another town", () => {
    const [r] = dayChoices(
      t,
      now,
      [route("a", 85, { end: "Near" })],
      () => 7,
    ).filter((c) => !c.current);
    expect(r).toMatchObject({ kind: "stop", nextDistance: 60_000, hotels: 7 });
  });

  it("says how a route differs from the day", () => {
    const list = dayChoices(t, now, [
      route("short", 60, { ascent: 100, end: "A" }),
      route("long", 100, { ascent: 900, end: "B" }),
    ]);
    const detail = (id: string) => list.find((c) => c.id === id)?.detail;
    expect(detail("route:short")).toBe("dayRoutes.shorter · dayRoutes.flatter");
    expect(detail("route:long")).toBe("dayRoutes.longer · dayRoutes.hillier");
  });

  it("shows routes to the same stop with the same name once", () => {
    const list = dayChoices(t, now, [
      route("a", 85, { via: "Forchheim" }),
      route("b", 99, { via: "Forchheim" }),
    ]);
    expect(list.filter((c) => !c.current).map((c) => c.id)).toEqual([
      "route:a",
    ]);
  });

  it("shows routes with the same place, km and climbing once", () => {
    const list = dayChoices(t, now, [
      route("a", 85, { end: "Near" }),
      route("previous", 85, { end: "Near" }),
      route("c", 85, { end: "Far" }),
    ]);
    expect(list.filter((c) => !c.current).map((c) => c.id)).toEqual([
      "route:a",
      "route:c",
    ]);
  });
});
