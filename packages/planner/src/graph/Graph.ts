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

/** Rises and drops smaller than this are DEM noise, like trees in a forest. */
const CLIMB_HYSTERESIS_M = 10;

/**
 * Ascent and descent of an elevation profile, without noise. The DEM is a
 * surface model, so summing every step gives about three times what the
 * router reports. Never less than the net change.
 */
export function filteredClimb(elevation: number[]): {
  ascent: number;
  descent: number;
} {
  let ascent = 0;
  let descent = 0;
  let ref = elevation[0] ?? 0;
  for (const x of elevation) {
    if (x > ref + CLIMB_HYSTERESIS_M) {
      ascent += x - ref;
      ref = x;
    } else if (x < ref - CLIMB_HYSTERESIS_M) {
      descent += ref - x;
      ref = x;
    }
  }
  const net = (elevation.at(-1) ?? 0) - (elevation[0] ?? 0);
  return {
    ascent: Math.round(Math.max(ascent, net)),
    descent: Math.round(Math.max(descent, -net)),
  };
}

/**
 * Ascent and descent along a path of edges, filtered like filteredClimb but
 * across edge ends. Edges are about 1 km long, so filtering each one alone
 * still counts much of the noise: about 30 % more than the router reports.
 */
export class PathClimb {
  /** Climbing counted so far, without the rest under the threshold. */
  ascent = 0;
  descent = 0;
  private ref: number | undefined;
  private last = 0;

  add(edge: NetworkEdge, forward: boolean): void {
    const ele = edge.elevation;
    if (ele.length < 2) {
      // No profile: take the edge's own numbers.
      const up = forward ? edge.ascent : edge.descent;
      const down = forward ? edge.descent : edge.ascent;
      this.ascent += up;
      this.descent += down;
      this.last += up - down;
      if (this.ref !== undefined) this.ref += up - down;
      return;
    }
    const n = ele.length;
    for (let i = 0; i < n; i++) {
      const x = ele[forward ? i : n - 1 - i] ?? 0;
      this.last = x;
      if (this.ref === undefined) this.ref = x;
      else if (x > this.ref + CLIMB_HYSTERESIS_M) {
        this.ascent += x - this.ref;
        this.ref = x;
      } else if (x < this.ref - CLIMB_HYSTERESIS_M) {
        this.descent += this.ref - x;
        this.ref = x;
      }
    }
  }

  /** Totals with the rest counted, so ascent − descent is the net change. */
  total(): { ascent: number; descent: number } {
    const rest = this.last - (this.ref ?? this.last);
    return {
      ascent: this.ascent + Math.max(0, rest),
      descent: this.descent + Math.max(0, -rest),
    };
  }
}

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
  /**
   * The same as flat arrays, for fast searches: the edges of node i are
   * adjEdge[adjStart[i]] to adjEdge[adjStart[i + 1] - 1], and adjTo holds
   * the node at their other end.
   */
  readonly adjStart: Int32Array;
  readonly adjEdge: Int32Array;
  readonly adjTo: Int32Array;
  /** Length of each edge. */
  readonly lengthKm: Float64Array;
  /** Whether edges carry scenery data. The Oberfranken mock has none. */
  readonly hasScenery: boolean;
  private index: Flatbush;
  private lines = new Map<number, EdgeLine>();

  constructor(network: RouteNetwork) {
    this.version = network.version;
    this.nodes = network.nodes;
    this.edges = network.edges.map((e) =>
      e.elevation.length > 1 ? { ...e, ...filteredClimb(e.elevation) } : e,
    );
    this.adjacency = network.nodes.map(() => []);
    this.hasScenery = network.edges.some((e) => e.scenery);
    for (const e of this.edges) {
      this.edgesAt(e.from).push(e.id);
      if (e.to !== e.from) this.edgesAt(e.to).push(e.id);
    }
    const n = network.nodes.length;
    this.adjStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      this.adjStart[i + 1] =
        (this.adjStart[i] ?? 0) + (this.adjacency[i]?.length ?? 0);
    }
    this.adjEdge = new Int32Array(this.adjStart[n] ?? 0);
    this.adjTo = new Int32Array(this.adjEdge.length);
    for (let i = 0; i < n; i++) {
      let j = this.adjStart[i] ?? 0;
      for (const id of this.edgesAt(i)) {
        this.adjEdge[j] = id;
        this.adjTo[j++] = this.other(id, i);
      }
    }
    this.lengthKm = Float64Array.from(this.edges, (e) => e.lengthKm);
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
