import type { BBox, LonLat, Places, RouteNetwork } from "@wayline/domain";
import { type RouteNetworkSource, tileKeys } from "@wayline/providers";

const KM_PER_LAT = 110.57;

/** Bbox around points, padded by km. */
export function bboxAround(points: LonLat[], km: number): BBox {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = km / KM_PER_LAT;
  const dLon = km / (KM_PER_LAT * Math.cos((lat * Math.PI) / 180));
  return [
    Math.min(...lons) - dLon,
    Math.min(...lats) - dLat,
    Math.max(...lons) + dLon,
    Math.max(...lats) + dLat,
  ];
}

/**
 * Network and places with node and edge ids as array indexes, as Graph
 * needs. Parts of a tiled network keep global ids, so they are mapped.
 * Places that snap to a node outside the network lose their node.
 */
export function localIds(
  network: RouteNetwork,
  places: Places,
): { network: RouteNetwork; places: Places } {
  const isLocal =
    network.nodes.every((n, i) => n.id === i) &&
    network.edges.every((e, i) => e.id === i);
  if (isLocal) return { network, places };

  const index = new Map(network.nodes.map((n, i) => [n.id, i]));
  const local = (id: number) => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`Edge ends outside network: ${id}`);
    return i;
  };
  const nodeId = (id: number | null) =>
    id === null ? null : (index.get(id) ?? null);
  return {
    network: {
      version: network.version,
      nodes: network.nodes.map((n, i) => ({ ...n, id: i })),
      edges: network.edges.map((e, i) => ({
        ...e,
        id: i,
        from: local(e.from),
        to: local(e.to),
      })),
    },
    places: {
      ...places,
      towns: places.towns.map((t) => ({ ...t, nodeId: nodeId(t.nodeId) })),
      stations: places.stations.map((s) => ({
        ...s,
        nodeId: nodeId(s.nodeId),
      })),
    },
  };
}

/** Areas kept in memory. Each holds a few tiles' worth of graph. */
const KEEP = 3;

/**
 * Builds something (a graph, a planner) for the network around a bbox and
 * caches it per set of tiles. Untiled sources have one area.
 */
export class AreaCache<T> {
  private cache = new Map<string, Promise<T>>();

  constructor(
    private source: RouteNetworkSource,
    private build: (network: RouteNetwork, places: Places) => T,
  ) {}

  async get(bbox: BBox): Promise<T> {
    const { tiles } = await this.source.manifest();
    const key = tiles ? tileKeys(tiles, bbox).join() : "all";
    let area = this.cache.get(key);
    if (area) {
      // Most recently used last.
      this.cache.delete(key);
    } else {
      area = this.load(bbox);
      area.catch(() => this.cache.delete(key));
    }
    this.cache.set(key, area);
    for (const old of this.cache.keys()) {
      if (this.cache.size <= KEEP) break;
      this.cache.delete(old);
    }
    return area;
  }

  private async load(bbox: BBox): Promise<T> {
    const [network, places] = await Promise.all([
      this.source.network(bbox),
      this.source.places(),
    ]);
    const local = localIds(network, places);
    return this.build(local.network, local.places);
  }
}
