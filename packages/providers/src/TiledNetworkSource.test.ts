import type { BBox, NetworkTile } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { mergeTiles, TiledNetworkSource, tileKeys } from "./index";
import { readDataFile } from "./mock/testData";

const BASE = "/data/mock/heidelberg";
const heidelberg: [number, number] = [8.6756, 49.4037];
// About 10 km around Heidelberg. Inside tile 17_98.
const nearHeidelberg: BBox = [8.55, 49.33, 8.8, 49.48];

function source() {
  const urls: string[] = [];
  const s = new TiledNetworkSource(async (url) => {
    urls.push(url);
    return readDataFile(url);
  }, BASE);
  return { s, urls };
}

describe("tileKeys", () => {
  const index = {
    size: 0.5,
    path: "tiles/{key}.json",
    keys: ["16_98", "17_98", "17_99"],
  };

  it("returns existing tiles that overlap the bbox", () => {
    expect(tileKeys(index, [8.1, 49.1, 8.7, 49.4])).toEqual(["16_98", "17_98"]);
    expect(tileKeys(index, [8.6, 49.1, 8.7, 49.6])).toEqual(["17_98", "17_99"]);
  });

  it("returns nothing outside the region", () => {
    expect(tileKeys(index, [0, 0, 1, 1])).toEqual([]);
  });
});

describe("mergeTiles", () => {
  const node = (id: number) => ({
    id,
    lon: 0,
    lat: 0,
    kind: "junction" as const,
    hotelCount: 0,
  });
  const edge = (id: number, from: number, to: number) =>
    ({ id, from, to }) as NetworkTile["edges"][number];

  it("keeps each node and edge once, sorted by id", () => {
    const a: NetworkTile = {
      version: "v",
      tile: "a",
      nodes: [node(3), node(1)],
      edges: [edge(7, 1, 3)],
    };
    const b: NetworkTile = {
      version: "v",
      tile: "b",
      nodes: [node(3), node(2)],
      edges: [edge(7, 1, 3), edge(5, 3, 2)],
    };
    const n = mergeTiles("v", [a, b]);
    expect(n.nodes.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(n.edges.map((x) => x.id)).toEqual([5, 7]);
  });
});

describe("TiledNetworkSource", () => {
  it("loads only the tiles near a bbox", async () => {
    const { s, urls } = source();
    const network = await s.network(nearHeidelberg);
    const manifest = await s.manifest();
    expect(network.version).toBe(manifest.version);
    expect(manifest.tiles!.keys.length).toBeGreaterThan(1);
    expect(urls.filter((u) => u.includes("/tiles/"))).toEqual([
      `${BASE}/tiles/17_98.json`,
    ]);
  });

  it("returns a closed network: every edge end is a node", async () => {
    const { s } = source();
    const network = await s.network(nearHeidelberg);
    const ids = new Set(network.nodes.map((n) => n.id));
    expect(ids.size).toBe(network.nodes.length);
    for (const e of network.edges) {
      expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
    }
  });

  it("has Heidelberg Hbf on the network", async () => {
    const { s } = source();
    const [places, network] = await Promise.all([
      s.places(),
      s.network(nearHeidelberg),
    ]);
    const hbf = places.stations.find(
      (st) => st.name === "Heidelberg Hauptbahnhof",
    );
    expect(hbf?.nodeId).not.toBeNull();
    const node = network.nodes.find((n) => n.id === hbf!.nodeId);
    expect(node).toBeDefined();
    expect(Math.abs(node!.lon - heidelberg[0])).toBeLessThan(0.05);
  });

  it("fetches each file once", async () => {
    const { s, urls } = source();
    await Promise.all([
      s.network(nearHeidelberg),
      s.network(nearHeidelberg),
      s.places(),
    ]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("retries a tile that failed to load", async () => {
    let fail = true;
    const s = new TiledNetworkSource(async (url) => {
      if (fail && url.includes("/tiles/")) throw new Error("offline");
      return readDataFile(url);
    }, BASE);
    await expect(s.network(nearHeidelberg)).rejects.toThrow("offline");
    fail = false;
    const network = await s.network(nearHeidelberg);
    expect(network.edges.length).toBeGreaterThan(0);
  });
});

describe("place tiles", () => {
  const town = (id: string, lon: number, nodeId: number | null) => ({
    id,
    name: id,
    place: "town" as const,
    lon,
    lat: 49.2,
    hotelCount: 0,
    nodeId,
  });
  const files: Record<string, unknown> = {
    "manifest.json": {
      version: "v",
      region: { name: "Test", bbox: [8, 49, 9.5, 49.5] },
      files: { search: "search.json" },
      tiles: {
        size: 0.5,
        path: "tiles/{key}.json",
        keys: ["16_98", "17_98"],
        places: { path: "places/{key}.json", keys: ["16_98", "18_98"] },
      },
      createdAt: "2026-11-02",
    },
    "places/16_98.json": {
      version: "v",
      tile: "16_98",
      towns: [town("a", 8.2, 1)],
      stations: [],
      hotels: [],
    },
    "places/18_98.json": {
      version: "v",
      tile: "18_98",
      towns: [town("b", 9.2, null)],
      stations: [],
      hotels: [],
    },
    "search.json": {
      version: "v",
      places: [{ i: "a", n: "a", k: "town", x: 8.2, y: 49.2 }],
    },
  };
  function tiled() {
    const urls: string[] = [];
    const s = new TiledNetworkSource(async (url) => {
      urls.push(url);
      return files[url.replace("/data/test/", "")];
    }, "/data/test");
    return { s, urls };
  }

  it("loads only the place tiles near a bbox", async () => {
    const { s, urls } = tiled();
    const places = await s.places([8.1, 49.1, 8.4, 49.3]);
    expect(places.towns.map((t) => t.id)).toEqual(["a"]);
    expect(urls.filter((u) => u.includes("/places/"))).toEqual([
      "/data/test/places/16_98.json",
    ]);
  });

  it("merges all place tiles without a bbox", async () => {
    const { s } = tiled();
    const places = await s.places();
    expect(places.towns.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("loads the search index, not the places", async () => {
    const { s, urls } = tiled();
    expect((await s.search()).places.map((p) => p.i)).toEqual(["a"]);
    expect(urls.some((u) => u.includes("/places/"))).toBe(false);
  });

  it("builds a search index from places.json in older data", async () => {
    const { s } = source();
    const index = await s.search();
    const places = await s.places();
    const onNetwork =
      places.towns.filter((t) => t.nodeId !== null).length +
      places.stations.filter((st) => st.nodeId !== null).length;
    expect(index.places).toHaveLength(onNetwork);
    expect(index.places.find((p) => p.n === "Heidelberg Hauptbahnhof")?.k).toBe(
      "station",
    );
  });
});
