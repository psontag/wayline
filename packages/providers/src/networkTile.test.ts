import { readFile } from "node:fs/promises";
import type { Manifest, NetworkTile } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { decodeNetworkTile, gunzip } from "./networkTile";
import { readDataFile } from "./mock/testData";
import { TiledNetworkSource } from "./TiledNetworkSource";

// fixtures/17_98.bin is the Heidelberg mock tile 17_98.json, packed by pipeline/export.py.
const packed = async () =>
  new Uint8Array(
    await readFile(new URL("../fixtures/17_98.bin", import.meta.url)),
  );
const json = () =>
  readDataFile(
    "/data/mock/heidelberg/tiles/17_98.json",
  ) as Promise<NetworkTile>;

describe("decodeNetworkTile", () => {
  it("gives the same tile as the JSON", async () => {
    const want = await json();
    const got = decodeNetworkTile(
      "17_98",
      want.version,
      await gunzip(await packed()),
    );
    expect(got).toEqual(want);
  });

  it("refuses other files", () => {
    expect(() => decodeNetworkTile("x", "v", new Uint8Array(24))).toThrow(
      /Not a network tile/,
    );
  });
});

describe("TiledNetworkSource with packed tiles", () => {
  it("loads packed tiles when the manifest says so", async () => {
    const want = await json();
    const manifest = (await readDataFile(
      "/data/mock/heidelberg/manifest.json",
    )) as Manifest;
    const tiles = {
      ...manifest.tiles!,
      format: 1 as const,
      path: "t/{key}.bin",
    };
    const fetched: string[] = [];
    const source = new TiledNetworkSource(
      async (url) =>
        url.endsWith("manifest.json")
          ? { ...manifest, tiles }
          : readDataFile(url),
      "/data/mock/heidelberg",
      async (url) => (fetched.push(url), packed()),
    );
    const tile = await source.tile("17_98");
    expect(fetched).toEqual(["/data/mock/heidelberg/t/17_98.bin"]);
    expect(tile.edges).toEqual(want.edges);
  });
});
