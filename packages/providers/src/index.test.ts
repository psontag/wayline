import { describe, expect, it } from "vitest";
import { cellOf, FakeWeather, MockLodging, MockNetworkSource } from "./index";
import { readMockFile } from "./mock/testData";

const source = new MockNetworkSource(readMockFile);
const bayreuth: [number, number] = [11.57435, 49.94463];

describe("MockNetworkSource", () => {
  it("loads manifest, network and places", async () => {
    const manifest = await source.manifest();
    expect(manifest.region.bbox).toHaveLength(4);
    const network = await source.network();
    expect(network.version).toBe(manifest.version);
    expect(network.nodes.length).toBeGreaterThan(1000);
    const edge = network.edges[0]!;
    expect(network.nodes[edge.from]).toBeDefined();
    const places = await source.places();
    expect(places.hotels.length).toBeGreaterThan(100);
  });

  it("fetches each file once", async () => {
    const urls: string[] = [];
    const s = new MockNetworkSource(async (url) => {
      urls.push(url);
      return readMockFile(url);
    }, "/base");
    await Promise.all([s.network(), s.network(), s.places()]);
    expect(urls.sort()).toEqual([
      "/base/manifest.json",
      "/base/network.json",
      "/base/places.json",
    ]);
  });
});

describe("MockLodging", () => {
  it("finds hotels near a town, nearest first", async () => {
    const hotels = await new MockLodging(source).hotelsNear(bayreuth, {
      radiusKm: 3,
    });
    expect(hotels.length).toBeGreaterThan(3);
    expect(hotels[0]!.distanceKm).toBeLessThanOrEqual(hotels[1]!.distanceKm);
    expect(hotels.every((h) => h.distanceKm <= 3)).toBe(true);
  });

  it("returns nothing far from any hotel", async () => {
    const hotels = await new MockLodging(source).hotelsNear([0, 0]);
    expect(hotels).toEqual([]);
  });
});

describe("FakeWeather", () => {
  const now = () => new Date(2027, 5, 10, 14, 0);
  const weather = new FakeWeather({ now, days: 16 });

  it("covers 16 days hourly from today", async () => {
    const { samples, cell } = await weather.forecast(bayreuth);
    expect(cell).toEqual([11.55, 49.95]);
    expect(samples).toHaveLength(16 * 24);
    expect(samples[0]!.time).toBe("2027-06-10T00:00");
  });

  it("is deterministic and plausible", async () => {
    const a = await weather.forecast(bayreuth);
    const b = await weather.forecast([11.551, 49.951]);
    expect(a).toEqual(b);
    for (const s of a.samples) {
      expect(s.temperature).toBeGreaterThan(0);
      expect(s.temperature).toBeLessThan(35);
      expect(s.windSpeed).toBeLessThan(40);
      expect(s.precipitationProbability).toBeLessThanOrEqual(1);
    }
    const afternoon = a.samples.find((s) => s.time.endsWith("15:00"))!;
    const night = a.samples.find((s) => s.time.endsWith("04:00"))!;
    expect(afternoon.temperature).toBeGreaterThan(night.temperature);
  });

  it("puts coordinates into 0.1° cells", () => {
    expect(cellOf([10.89973, 49.90064])).toEqual([10.85, 49.95]);
  });
});
