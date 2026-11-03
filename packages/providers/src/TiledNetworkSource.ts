import type {
  BBox,
  Manifest,
  NetworkEdge,
  NetworkNode,
  NetworkTile,
  PlaceTile,
  Places,
  RouteInfo,
  RouteNetwork,
  RouteTable,
  SearchEntry,
  SearchIndex,
  TileIndex,
} from "@wayline/domain";
import type { FetchJson, RouteNetworkSource } from "./types";

/**
 * Geodata built by pipeline/build.py, e.g. /data/de-2026-11-02-a8986415/.
 * Loads only the tiles a bbox needs. Each file loads once per source, and the
 * base URL holds the dataset version, so the cache is per version.
 */
export class TiledNetworkSource implements RouteNetworkSource {
  private cache = new Map<string, Promise<unknown>>();

  constructor(
    private fetchJson: FetchJson,
    private baseUrl: string,
  ) {}

  manifest(): Promise<Manifest> {
    return this.load("manifest.json") as Promise<Manifest>;
  }

  async places(bbox?: BBox): Promise<Places> {
    const { version, files, tiles } = await this.manifest();
    const index = tiles?.places;
    if (!index) {
      if (!files.places) throw new Error(`${this.baseUrl} has no places`);
      return this.load(files.places) as Promise<Places>;
    }
    const keys = bbox
      ? tileKeys({ ...tiles, keys: index.keys }, bbox)
      : index.keys;
    return mergePlaces(
      version,
      (await Promise.all(
        keys.map((k) => this.load(index.path.replace("{key}", k))),
      )) as PlaceTile[],
    );
  }

  async routes(): Promise<RouteInfo[]> {
    const { files } = await this.manifest();
    if (!files.routes) return [];
    return ((await this.load(files.routes)) as RouteTable).routes;
  }

  async search(): Promise<SearchIndex> {
    const { files } = await this.manifest();
    if (files.search) return this.load(files.search) as Promise<SearchIndex>;
    return searchIndex(await this.places());
  }

  async network(bbox?: BBox): Promise<RouteNetwork> {
    const { version, tiles } = await this.manifest();
    if (!tiles) throw new Error(`${this.baseUrl} is not a tiled dataset`);
    const keys = bbox ? tileKeys(tiles, bbox) : tiles.keys;
    return mergeTiles(
      version,
      await Promise.all(keys.map((k) => this.tile(k))),
    );
  }

  /** One tile by key. */
  async tile(key: string): Promise<NetworkTile> {
    const { tiles } = await this.manifest();
    if (!tiles) throw new Error(`${this.baseUrl} is not a tiled dataset`);
    return this.load(tiles.path.replace("{key}", key)) as Promise<NetworkTile>;
  }

  private load(file: string): Promise<unknown> {
    let p = this.cache.get(file);
    if (!p) {
      p = this.fetchJson(`${this.baseUrl}/${file}`);
      // A failed load is retried on the next call.
      p.catch(() => this.cache.delete(file));
      this.cache.set(file, p);
    }
    return p;
  }
}

/** Keys of the existing tiles that overlap bbox. */
export function tileKeys(index: TileIndex, [west, south, east, north]: BBox) {
  const exists = new Set(index.keys);
  const keys: string[] = [];
  for (let x = Math.floor(west / index.size); x * index.size <= east; x++) {
    for (let y = Math.floor(south / index.size); y * index.size <= north; y++) {
      const key = `${x}_${y}`;
      if (exists.has(key)) keys.push(key);
    }
  }
  return keys;
}

/** Places of several tiles. Each place is in one tile only. */
export function mergePlaces(version: string, tiles: PlaceTile[]): Places {
  return {
    version,
    towns: tiles.flatMap((t) => t.towns),
    stations: tiles.flatMap((t) => t.stations),
    hotels: tiles.flatMap((t) => t.hotels),
  };
}

/** Search index of data without one: towns and stations on the network. */
export function searchIndex(places: Places): SearchIndex {
  return {
    version: places.version,
    places: [
      ...places.towns
        .filter((t) => t.nodeId !== null)
        .map((t): SearchEntry => ({
          i: t.id,
          n: t.name,
          k: t.place,
          x: t.lon,
          y: t.lat,
          ...(t.hotelCount ? { h: t.hotelCount } : {}),
        })),
      ...places.stations
        .filter((s) => s.nodeId !== null)
        .map((s): SearchEntry => ({
          i: s.id,
          n: s.name,
          k: "station",
          x: s.lon,
          y: s.lat,
        })),
    ],
  };
}

/** One network from several tiles. Nodes and edges are sorted by id. */
export function mergeTiles(
  version: string,
  tiles: NetworkTile[],
): RouteNetwork {
  const nodes = new Map<number, NetworkNode>();
  const edges = new Map<number, NetworkEdge>();
  for (const t of tiles) {
    for (const n of t.nodes) nodes.set(n.id, n);
    for (const e of t.edges) edges.set(e.id, e);
  }
  const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
  return {
    version,
    nodes: [...nodes.values()].sort(byId),
    edges: [...edges.values()].sort(byId),
  };
}
