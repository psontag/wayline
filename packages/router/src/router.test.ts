import { readFile } from "node:fs/promises";
import type { RoutingTiles } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { Router } from "./router";
import { decodeSearch, gunzip } from "./tiles";

// Two tiles of Hessen around Marburg (8.75–9.25° E, 50.75–51° N).
const dir = new URL("../fixtures/", import.meta.url);
const read = async (path: string) => {
  try {
    return new Uint8Array(await readFile(new URL(path, dir)));
  } catch {
    return undefined;
  }
};
const index = async (): Promise<RoutingTiles> =>
  JSON.parse(new TextDecoder().decode(await read("manifest.json"))).routing;

const marburg: [number, number] = [8.7746, 50.819];
const kirchhain: [number, number] = [9.0113, 50.8263];

describe("decodeSearch", () => {
  it("reads a tile", async () => {
    const tile = decodeSearch(
      "35_203",
      await gunzip((await read("route/35_203.bin"))!),
    );
    expect(tile.ids.length).toBeGreaterThan(10_000);
    expect(tile.from.length).toBeGreaterThan(tile.ids.length);
    expect(tile.lon[0]! / 1e6).toBeGreaterThan(8);
    for (let i = 1; i < tile.ids.length; i++)
      expect(tile.ids[i]!).toBeGreaterThan(tile.ids[i - 1]!);
  });

  it("refuses other files", () => {
    expect(() => decodeSearch("x", new Uint8Array(8))).toThrow(
      /Not a routing tile/,
    );
  });
});

describe("Router", () => {
  it("routes across a tile border, close to BRouter", async () => {
    const fetched: string[] = [];
    const router = new Router(await index(), (p) => (fetched.push(p), read(p)));
    const leg = await router.route(marburg, kirchhain);
    expect(leg).toBeDefined();
    // BRouter touring: 25.3 km, 89 m up.
    expect(leg!.distance / 25_312).toBeGreaterThan(0.9);
    expect(leg!.distance / 25_312).toBeLessThan(1.1);
    expect(leg!.elevation).toHaveLength(leg!.points.length);
    expect(leg!.ascent).toBeGreaterThan(30);
    expect(leg!.ascent).toBeLessThan(250);
    const s = leg!.surface;
    expect(s.paved + s.gravel + s.unpaved).toBeCloseTo(1);
    expect(leg!.points[0]![0]).toBeCloseTo(marburg[0], 2);
    expect(leg!.points.at(-1)![0]).toBeCloseTo(kirchhain[0], 2);
    expect(fetched).toContain("route/36_203.geo.bin");
  });

  it("gives the same route both ways round, within a few percent", async () => {
    const router = new Router(await index(), read);
    const there = await router.route(marburg, kirchhain);
    const back = await router.route(kirchhain, marburg);
    expect(back!.distance / there!.distance).toBeGreaterThan(0.9);
    expect(back!.distance / there!.distance).toBeLessThan(1.1);
  });

  it("returns nothing for points outside the tiles", async () => {
    const router = new Router(await index(), read);
    expect(await router.route(marburg, [7, 50])).toBeUndefined();
  });

  it("stops when aborted", async () => {
    const router = new Router(await index(), read);
    expect(
      await router.route(marburg, kirchhain, { signal: { aborted: true } }),
    ).toBeUndefined();
  });
});
