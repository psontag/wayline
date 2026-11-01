import type {
  BBox,
  Manifest,
  NetworkEdge,
  NetworkNode,
  NetworkTile,
  Places,
  RouteNetwork,
  TileIndex,
} from "@wayline/domain";
import type { FetchJson, RouteNetworkSource } from "./types";

/**
 * Geodata built by pipeline/build.py, e.g. /data/south-2026-10-19-3f2a9c1d/.
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

  async places(): Promise<Places> {
    const manifest = await this.manifest();
    return this.load(manifest.files.places) as Promise<Places>;
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
