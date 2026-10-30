import {
  decodeLine,
  distanceKm,
  type LonLat,
  type NetworkEdge,
  type NetworkNode,
  type RouteNetwork,
} from "@wayline/domain";
import Flatbush from "flatbush";

// Index coordinates in rough km, so nearest-neighbor search works on degrees.
const KM_PER_LAT = 110.57;
const KM_PER_LON = 111.32 * Math.cos((50 * Math.PI) / 180);

export type EdgeLine = { coords: LonLat[]; elevation: number[] };

/** One step of a path: an edge and the direction it is used in. */
export type PathStep = { edge: number; forward: boolean };

/**
 * The route network as a graph. Node and edge ids are array indexes.
 * Edges are undirected. Ascent and geometry run from → to.
 */
export class Graph {
  readonly version: string;
  readonly nodes: NetworkNode[];
  readonly edges: NetworkEdge[];
  /** Edge ids at each node. */
  readonly adjacency: number[][];
  /** Whether edges carry scenery data. The Oberfranken mock has none. */
  readonly hasScenery: boolean;
  private index: Flatbush;
  private lines = new Map<number, EdgeLine>();

  constructor(network: RouteNetwork) {
    this.version = network.version;
    this.nodes = network.nodes;
    this.edges = network.edges;
    this.adjacency = network.nodes.map(() => []);
    this.hasScenery = network.edges.some((e) => e.scenery);
    for (const e of network.edges) {
      this.edgesAt(e.from).push(e.id);
      if (e.to !== e.from) this.edgesAt(e.to).push(e.id);
    }
    this.index = new Flatbush(Math.max(1, network.nodes.length));
    for (const n of network.nodes) {
      const x = n.lon * KM_PER_LON;
      const y = n.lat * KM_PER_LAT;
      this.index.add(x, y, x, y);
    }
    if (!network.nodes.length) this.index.add(0, 0, 0, 0);
    this.index.finish();
  }

  node(id: number): NetworkNode {
    const n = this.nodes[id];
    if (!n) throw new Error(`No node ${id}`);
    return n;
  }

  edge(id: number): NetworkEdge {
    const e = this.edges[id];
    if (!e) throw new Error(`No edge ${id}`);
    return e;
  }

  /** Edge ids at a node. */
  edgesAt(node: number): number[] {
    return this.adjacency[node] ?? [];
  }

  coord(node: number): LonLat {
    const n = this.node(node);
    return [n.lon, n.lat];
  }

  /** The node at the other end of an edge. */
  other(edge: number, node: number): number {
    const e = this.edge(edge);
    return e.from === node ? e.to : e.from;
  }

  /**
   * Nearest node within maxKm, or undefined.
   * filter limits the search, e.g. to towns with hotels.
   */
  nearestNode(
    coord: LonLat,
    {
      maxKm = 5,
      filter,
    }: { maxKm?: number; filter?: (n: NetworkNode) => boolean } = {},
  ): number | undefined {
    if (!this.nodes.length) return undefined;
    const [id] = this.index.neighbors(
      coord[0] * KM_PER_LON,
      coord[1] * KM_PER_LAT,
      1,
      maxKm * 1.1,
      filter && ((i) => filter(this.node(i))),
    );
    if (id === undefined) return undefined;
    return distanceKm(coord, this.coord(id)) <= maxKm ? id : undefined;
  }

  /** Nodes within radiusKm, nearest first. */
  nodesWithin(coord: LonLat, radiusKm: number): number[] {
    if (!this.nodes.length) return [];
    return this.index
      .neighbors(
        coord[0] * KM_PER_LON,
        coord[1] * KM_PER_LAT,
        Infinity,
        radiusKm * 1.1,
      )
      .filter((i) => distanceKm(coord, this.coord(i)) <= radiusKm);
  }

  /** Decoded geometry and elevation of an edge, in the given direction. */
  edgeLine(edge: number, forward = true): EdgeLine {
    let line = this.lines.get(edge);
    if (!line) {
      const e = this.edge(edge);
      line = { coords: decodeLine(e.geometry), elevation: e.elevation };
      this.lines.set(edge, line);
    }
    if (forward) return line;
    return {
      coords: [...line.coords].reverse(),
      elevation: [...line.elevation].reverse(),
    };
  }
}
