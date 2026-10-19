/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  decodeLine,
  distanceKm,
  isErrorCode,
  type LonLat,
} from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { fetchBrouterLeg, type HttpFetch } from "./fetch";
import { parseBrouterLeg, surfaceOf } from "./parse";
import { brouterProfileHash } from "./profiles";

const fixture = (name: string) =>
  readFileSync(
    new URL(`../../fixtures/brouter/${name}.json`, import.meta.url),
    "utf8",
  );

const bamberg: LonLat = [10.8873, 49.8917];
const forchheim: LonLat = [11.0587, 49.7186];

function answer(status: number, body: string): HttpFetch {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

describe("fetchBrouterLeg", () => {
  it("asks for one leg as GeoJSON and wraps the answer", async () => {
    const urls: string[] = [];
    const body = fixture("bamberg-forchheim-touring");
    const envelope = await fetchBrouterLeg(bamberg, forchheim, "touring", {
      baseUrl: "http://localhost:17777/",
      fetch: async (url) => {
        urls.push(url);
        return answer(200, body)(url);
      },
    });
    expect(urls).toEqual([
      "http://localhost:17777/brouter?lonlats=10.8873%2C49.8917%7C11.0587%2C49.7186&profile=touring&alternativeidx=0&format=geojson",
    ]);
    expect(envelope.provider).toBe("brouter");
    expect(envelope.profileHash).toBe(brouterProfileHash("touring"));
    expect(envelope.raw).toEqual(JSON.parse(body));
  });

  it("reports no route as INVALID", async () => {
    const error = await fetchBrouterLeg(bamberg, [20, 60], "touring", {
      baseUrl: "http://x",
      fetch: answer(400, "datafile E20_N60.rd5 not found\n"),
    }).catch((e) => e);
    expect(isErrorCode(error, "INVALID")).toBe(true);
    expect(error.message).toBe("BRouter: datafile E20_N60.rd5 not found");
  });

  it("reports server and network errors as PROVIDER_UNAVAILABLE", async () => {
    const options = { baseUrl: "http://x", fetch: answer(500, "") };
    const server = await fetchBrouterLeg(
      bamberg,
      forchheim,
      "fast",
      options,
    ).catch((e) => e);
    expect(isErrorCode(server, "PROVIDER_UNAVAILABLE")).toBe(true);
    const network = await fetchBrouterLeg(bamberg, forchheim, "fast", {
      baseUrl: "http://x",
      fetch: () => Promise.reject(new Error("ECONNREFUSED")),
    }).catch((e) => e);
    expect(isErrorCode(network, "PROVIDER_UNAVAILABLE")).toBe(true);
  });
});

describe("parseBrouterLeg", () => {
  const parse = (name: string, from: LonLat, to: LonLat) =>
    parseBrouterLeg(
      { provider: "brouter", profileHash: "h", raw: JSON.parse(fixture(name)) },
      from,
      to,
    );

  it("reads geometry, elevation and totals", () => {
    const leg = parse("bamberg-forchheim-touring", bamberg, forchheim);
    const coords = decodeLine(leg.geometry);
    expect(coords.length).toBeGreaterThan(100);
    expect(leg.elevation).toHaveLength(coords.length);
    expect(distanceKm(coords[0]!, bamberg)).toBeLessThan(0.2);
    expect(distanceKm(coords.at(-1)!, forchheim)).toBeLessThan(0.2);
    expect(leg.distance).toBeGreaterThan(20_000);
    expect(leg.distance).toBeLessThan(40_000);
    expect(leg.ascent).toBeGreaterThan(0);
    expect(leg.descent).toBeGreaterThan(0);
    // Net change matches the elevation profile.
    const net = leg.elevation.at(-1)! - leg.elevation[0]!;
    expect(leg.ascent - leg.descent).toBeCloseTo(net, -1);
    expect(leg).toMatchObject({
      from: bamberg,
      to: forchheim,
      provider: "brouter",
      profileHash: "h",
    });
  });

  it("splits the distance by surface", () => {
    for (const [name, from, to] of [
      ["bamberg-forchheim-touring", bamberg, forchheim],
      ["ebrach-burgebrach-scenic", [10.4934, 49.851], [10.7461, 49.8274]],
      ["forchheim-erlangen-fast", forchheim, [11.0026, 49.5964]],
    ] as [string, LonLat, LonLat][]) {
      const { surface } = parse(name, from, to);
      expect(surface.paved + surface.gravel + surface.unpaved).toBeCloseTo(1);
      expect(surface.paved).toBeGreaterThan(0.5);
    }
  });

  it("rejects answers that are not BRouter GeoJSON", () => {
    expect(() =>
      parseBrouterLeg(
        { provider: "brouter", profileHash: "h", raw: {} },
        bamberg,
        forchheim,
      ),
    ).toThrow();
  });
});

describe("surfaceOf", () => {
  it.each([
    ["highway=residential surface=asphalt", "paved"],
    ["highway=track surface=compacted", "gravel"],
    ["highway=path surface=ground", "unpaved"],
    ["highway=track tracktype=grade1", "paved"],
    ["highway=track tracktype=grade2", "gravel"],
    ["highway=track tracktype=grade4", "unpaved"],
    ["highway=track", "gravel"],
    ["highway=tertiary", "paved"],
  ])("%s is %s", (tags, expected) => {
    expect(surfaceOf(tags)).toBe(expected);
  });
});

describe("brouterProfileHash", () => {
  it("matches the profile files", () => {
    for (const profile of ["touring", "fast", "scenic", "quiet"] as const) {
      const file = readFileSync(
        new URL(
          `../../../../infra/brouter/profiles/${profile}.brf`,
          import.meta.url,
        ),
      );
      const hash = createHash("sha256").update(file).digest("hex").slice(0, 12);
      expect(brouterProfileHash(profile)).toBe(`${profile}-${hash}`);
    }
  });
});
