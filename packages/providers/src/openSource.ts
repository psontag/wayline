import type { Manifest } from "@wayline/domain";
import { MockNetworkSource } from "./mock/MockNetworkSource";
import { TiledNetworkSource } from "./TiledNetworkSource";
import type { FetchJson, RouteNetworkSource } from "./types";

/** The source for a data folder: tiled if its manifest lists tiles. */
export async function openSource(
  fetchJson: FetchJson,
  baseUrl: string,
): Promise<RouteNetworkSource> {
  const manifest = (await fetchJson(`${baseUrl}/manifest.json`)) as Manifest;
  return manifest.tiles
    ? new TiledNetworkSource(fetchJson, baseUrl)
    : new MockNetworkSource(fetchJson, baseUrl);
}
