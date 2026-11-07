import { decodeLine, type LonLat } from "@wayline/domain";
import { fetchFixture } from "@wayline/router/testing";
import { describe, expect, it } from "vitest";
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

  it("stops when aborted", async () => {
    await expect(
      routing().route([marburg, kirchhain], {
        profile: "touring",
        signal: { aborted: true },
      }),
    ).rejects.toThrow(/Aborted/);
  });
});
