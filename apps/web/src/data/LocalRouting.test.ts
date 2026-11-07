import { decodeLine, type LonLat } from "@wayline/domain";
import { fetchFixture } from "@wayline/router/testing";
import { describe, expect, it, vi } from "vitest";
import { LocalRouting } from "./LocalRouting";

// The fixture holds two tiles around Marburg.
const marburg: LonLat = [8.7746, 50.819];
const cappel: LonLat = [8.813, 50.766];
const kirchhain: LonLat = [9.0113, 50.8263];

const routing = () =>
  new LocalRouting(Promise.resolve("/fixture"), fetchFixture as typeof fetch);

describe("LocalRouting", () => {
  it("returns one leg per pair of points", async () => {
    const legs = await routing().route([marburg, cappel, kirchhain], {
      profile: "touring",
    });
    expect(legs).toHaveLength(2);
    const [first, second] = legs;
    expect(first?.from).toEqual(marburg);
    expect(second?.to).toEqual(kirchhain);
    for (const leg of legs) {
      const line = decodeLine(leg.geometry);
      expect(leg.elevation).toHaveLength(line.length);
      expect(leg.distance).toBeGreaterThan(1000);
      expect(leg.provider).toBe("local");
    }
  });

  it("fails for points outside the tiles", async () => {
    await expect(
      routing().route([marburg, [7, 50]], { profile: "touring" }),
    ).rejects.toThrow(/No route/);
  });

  it("shares tiles between calls until it was idle for a while", async () => {
    vi.useFakeTimers();
    try {
      const fetched: string[] = [];
      const counting = (input: string | URL | Request) => {
        fetched.push(String(input));
        return fetchFixture(input);
      };
      const shared = new LocalRouting(
        Promise.resolve("/fixture"),
        counting as typeof fetch,
      );
      const tiles = () => fetched.filter((f) => f.endsWith(".bin")).length;
      const options = { profile: "touring" } as const;
      await Promise.all([
        shared.route([marburg, cappel], options),
        shared.route([marburg, kirchhain], options),
      ]);
      const first = tiles();
      await shared.route([cappel, kirchhain], options);
      expect(tiles()).toBe(first);
      vi.advanceTimersByTime(60_000);
      await shared.route([cappel, kirchhain], options);
      expect(tiles()).toBeGreaterThan(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("snaps a point to a way close by", async () => {
    const near = await routing().snap([8.8, 50.8], 0.5);
    expect(near).toBeDefined();
    expect(near).not.toEqual([8.8, 50.8]);
    expect(await routing().snap([7, 50], 0.5)).toBeUndefined();
  });

  it("stops when aborted", async () => {
    await expect(
      routing().route([marburg, kirchhain], {
        profile: "touring",
        signal: { aborted: true },
      }),
    ).rejects.toThrow(/Aborted/);
  });
});
