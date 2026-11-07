import type { LonLat, RoutingTiles, Surface } from "@wayline/domain";
import FlatQueue from "flatqueue";
import { DOWNHILL_COST, TURN_COST, bitsOf, surfaceOf, wayFactor } from "./cost";
import {
  COORD,
  decodeGeometry,
  decodeSearch,
  gunzip,
  type GeometryTile,
  type SearchTile,
} from "./tiles";

/** Bytes of a file next to the manifest, or undefined if it is missing. */
export type FetchFile = (path: string) => Promise<Uint8Array | undefined>;

export type RoutedLeg = {
  points: LonLat[];
  /** Meters, one per point. */
  elevation: number[];
  /** Meters. */
  distance: number;
  ascent: number;
  descent: number;
  surface: Surface;
};

export type RouteOptions = {
  signal?: { readonly aborted: boolean };
  /** Gives up after this many nodes. */
  maxSettled?: number;
};

/** A tile with the adjacency of the nodes it owns (the nodes inside it). */
type Tile = {
  slot: number;
  s: SearchTile;
  owned: Uint8Array;
  /** Entries of local node i: adjStart[i] to adjStart[i + 1]. */
  adjStart: Int32Array;
  adjTo: Int32Array;
  adjEdge: Int32Array;
  adjForward: Uint8Array;
  adjCost: Float64Array;
  /** Of the straight line from → to. Shape points don't change routes much. */
  adjBearing: Float64Array;
  adjSigned: Uint8Array;
  geometry?: Promise<GeometryTile | undefined>;
};

// Node and entry references: slot × SLOT + local index.
const SLOT = 2 ** 24;
const SNAP_M = 2000;
const M_PER_DEG = 111_195;

const meters = (lon1: number, lat1: number, lon2: number, lat2: number) =>
  Math.hypot(
    (lon2 - lon1) * M_PER_DEG * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180),
    (lat2 - lat1) * M_PER_DEG,
  );

/** A* on the routing tiles. Loads tiles as the search reaches them. */
export class Router {
  private keys: Set<string>;
  private tiles = new Map<string, Promise<Tile | undefined>>();
  private slots: Tile[] = [];

  constructor(
    private index: RoutingTiles,
    private fetchFile: FetchFile,
  ) {
    this.keys = new Set(index.keys);
  }

  /** Same arithmetic as tile_of in pipeline/routing.py. */
  private keyOf(lon: number, lat: number) {
    const size = this.index.size;
    return `${Math.floor(lon / COORD / size)}_${Math.floor(lat / COORD / size)}`;
  }

  private async bytes(path: string) {
    const raw = await this.fetchFile(path);
    if (!raw) return undefined;
    // A host may already have unpacked it.
    return raw[0] === 0x1f && raw[1] === 0x8b ? gunzip(raw) : raw;
  }

  private load(key: string): Promise<Tile | undefined> {
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = this.keys.has(key)
        ? this.bytes(this.index.path.replace("{key}", key)).then(
            (b) => b && this.adjacency(decodeSearch(key, b)),
          )
        : Promise.resolve(undefined);
      this.tiles.set(key, tile);
    }
    return tile;
  }

  private adjacency(s: SearchTile): Tile {
    const n = s.ids.length;
    const owned = new Uint8Array(n);
    for (let i = 0; i < n; i++)
      owned[i] = this.keyOf(s.lon[i], s.lat[i]) === s.key ? 1 : 0;
    const adjStart = new Int32Array(n + 1);
    const usable = (e: number, forward: boolean) => {
      const b = bitsOf(s.bits[e]);
      const at = forward ? s.from[e] : s.to[e];
      return owned[at] === 1 && (forward ? b.forward : b.backward) === 1;
    };
    const m = s.from.length;
    for (let e = 0; e < m; e++) {
      if (usable(e, true)) adjStart[s.from[e] + 1]++;
      if (usable(e, false)) adjStart[s.to[e] + 1]++;
    }
    for (let i = 0; i < n; i++) adjStart[i + 1] += adjStart[i];
    const size = adjStart[n];
    const tile: Tile = {
      slot: this.slots.length,
      s,
      owned,
      adjStart,
      adjTo: new Int32Array(size),
      adjEdge: new Int32Array(size),
      adjForward: new Uint8Array(size),
      adjCost: new Float64Array(size),
      adjBearing: new Float64Array(size),
      adjSigned: new Uint8Array(size),
    };
    const fill = adjStart.slice(0, n);
    for (let e = 0; e < m; e++) {
      const factor = wayFactor(s.bits[e], this.index.highways);
      const signed = bitsOf(s.bits[e]).signed;
      for (const forward of [true, false]) {
        if (!usable(e, forward)) continue;
        const [a, b] = forward ? [s.from[e], s.to[e]] : [s.to[e], s.from[e]];
        const down = (forward ? s.downF[e] : s.downB[e]) / 10;
        const i = fill[a]++;
        tile.adjTo[i] = b;
        tile.adjEdge[i] = e;
        tile.adjForward[i] = forward ? 1 : 0;
        tile.adjCost[i] = Math.max(
          1,
          s.length[e] * factor + DOWNHILL_COST * down,
        );
        tile.adjBearing[i] = Math.atan2(
          s.lat[b] - s.lat[a],
          (s.lon[b] - s.lon[a]) *
            Math.cos((s.lat[a] / COORD) * (Math.PI / 180)),
        );
        tile.adjSigned[i] = signed;
      }
    }
    this.slots.push(tile);
    return tile;
  }

  /** The tile that owns node id, and its index there. */
  private async owner(tile: Tile, local: number) {
    if (tile.owned[local]) return { tile, local };
    const s = tile.s;
    const other = await this.load(this.keyOf(s.lon[local], s.lat[local]));
    if (!other) return undefined;
    const i = binarySearch(other.s.ids, s.ids[local]);
    return i < 0 ? undefined : { tile: other, local: i };
  }

  /** Nearest node to a point, within SNAP_M. */
  private async snap([lon, lat]: LonLat) {
    const x = lon * COORD;
    const y = lat * COORD;
    let best: { tile: Tile; local: number } | undefined;
    let bestM = SNAP_M;
    const dLat = SNAP_M / M_PER_DEG;
    const dLon = dLat / Math.cos((lat * Math.PI) / 180);
    const size = this.index.size;
    const keys = new Set<string>();
    for (const fx of [-1, 0, 1])
      for (const fy of [-1, 0, 1])
        keys.add(
          `${Math.floor((lon + fx * dLon) / size)}_${Math.floor((lat + fy * dLat) / size)}`,
        );
    for (const key of keys) {
      const tile = await this.load(key);
      if (!tile) continue;
      const s = tile.s;
      for (let i = 0; i < s.ids.length; i++) {
        if (!tile.owned[i]) continue;
        const d = meters(
          x / COORD,
          y / COORD,
          s.lon[i] / COORD,
          s.lat[i] / COORD,
        );
        if (d < bestM) {
          bestM = d;
          best = { tile, local: i };
        }
      }
    }
    return best;
  }

  /** Cheapest route between two points, or undefined if there is none. */
  async route(
    from: LonLat,
    to: LonLat,
    { signal, maxSettled = 3_000_000 }: RouteOptions = {},
  ): Promise<RoutedLeg | undefined> {
    const [start, target] = await Promise.all([this.snap(from), this.snap(to)]);
    if (!start || !target) return undefined;
    const sId = start.tile.s.ids[start.local];
    const tId = target.tile.s.ids[target.local];
    const tLon = target.tile.s.lon[target.local] / COORD;
    const tLat = target.tile.s.lat[target.local] / COORD;

    const cost = new Map<number, number>([[sId, 0]]);
    /** Where a node was seen: slot × SLOT + local index. */
    const where = new Map<number, number>([
      [sId, start.tile.slot * SLOT + start.local],
    ]);
    /** Entry used to reach a node: slot × SLOT + entry index. */
    const via = new Map<number, number>();
    const done = new Set<number>();
    const queue = new FlatQueue<number>();
    queue.push(sId, 0);

    while (queue.length && done.size < maxSettled) {
      if (signal?.aborted) return undefined;
      const u = queue.pop();
      if (u === undefined || done.has(u)) continue;
      done.add(u);
      if (u === tId) break;
      const ref = where.get(u) ?? 0;
      const found = await this.owner(
        this.slots[Math.floor(ref / SLOT)],
        ref % SLOT,
      );
      if (!found) continue;
      const { tile, local } = found;
      const s = tile.s;
      const cu = cost.get(u) ?? 0;
      const prev = via.get(u);
      const inBearing =
        prev === undefined
          ? undefined
          : this.slots[Math.floor(prev / SLOT)].adjBearing[prev % SLOT];
      for (let i = tile.adjStart[local]; i < tile.adjStart[local + 1]; i++) {
        const b = tile.adjTo[i];
        const v = s.ids[b];
        if (done.has(v)) continue;
        let c = cu + tile.adjCost[i];
        if (inBearing !== undefined && !tile.adjSigned[i])
          c += TURN_COST * (1 - Math.cos(tile.adjBearing[i] - inBearing));
        if (c < (cost.get(v) ?? Infinity)) {
          cost.set(v, c);
          where.set(v, tile.slot * SLOT + b);
          via.set(v, tile.slot * SLOT + i);
          const h = meters(s.lon[b] / COORD, s.lat[b] / COORD, tLon, tLat);
          queue.push(v, c + h);
        }
      }
    }
    if (!done.has(tId)) return undefined;

    const steps: { tile: Tile; entry: number }[] = [];
    for (let v = tId; v !== sId;) {
      const ref = via.get(v);
      if (ref === undefined) return undefined;
      const tile = this.slots[Math.floor(ref / SLOT)];
      const entry = ref % SLOT;
      steps.push({ tile, entry });
      const e = tile.adjEdge[entry];
      v = tile.s.ids[tile.adjForward[entry] ? tile.s.from[e] : tile.s.to[e]];
    }
    steps.reverse();
    return this.leg(steps, start);
  }

  private geometry(tile: Tile) {
    tile.geometry ??= this.bytes(
      this.index.geometry.replace("{key}", tile.s.key),
    ).then((b) => b && decodeGeometry(b));
    return tile.geometry;
  }

  private async leg(
    steps: { tile: Tile; entry: number }[],
    start: { tile: Tile; local: number },
  ): Promise<RoutedLeg> {
    const geometries = await Promise.all(
      steps.map((st) => this.geometry(st.tile)),
    );
    const s0 = start.tile.s;
    const points: LonLat[] = [
      [s0.lon[start.local] / COORD, s0.lat[start.local] / COORD],
    ];
    const elevation: number[] = [];
    const surface: Surface = { paved: 0, gravel: 0, unpaved: 0 };
    let distance = 0;
    steps.forEach(({ tile, entry }, k) => {
      const s = tile.s;
      const e = tile.adjEdge[entry];
      const g = geometries[k];
      const edgePoints: LonLat[] = [];
      const edgeEle: number[] = [];
      let x = s.lon[s.from[e]];
      let y = s.lat[s.from[e]];
      edgePoints.push([x / COORD, y / COORD]);
      if (g) {
        for (let j = g.start[e]; j < g.start[e + 1]; j++) {
          x += g.dlon[j];
          y += g.dlat[j];
          edgePoints.push([x / COORD, y / COORD]);
        }
        const first = g.start[e] + 2 * e;
        for (let j = first; j < g.start[e + 1] + 2 * e + 2; j++)
          edgeEle.push(g.elevation[j]);
      }
      edgePoints.push([s.lon[s.to[e]] / COORD, s.lat[s.to[e]] / COORD]);
      if (!tile.adjForward[entry]) {
        edgePoints.reverse();
        edgeEle.reverse();
      }
      if (k === 0) elevation.push(edgeEle[0] ?? 0);
      points.push(...edgePoints.slice(1));
      for (let j = 1; j < edgePoints.length; j++)
        elevation.push(edgeEle[j] ?? elevation.at(-1) ?? 0);
      distance += s.length[e];
      surface[surfaceOf(s.bits[e], this.index.highways)] += s.length[e];
    });
    if (!steps.length) elevation.push(0);
    let ascent = 0;
    let descent = 0;
    for (let j = 1; j < elevation.length; j++) {
      const d = elevation[j] - elevation[j - 1];
      if (d > 0) ascent += d;
      else descent -= d;
    }
    if (distance > 0)
      for (const k of ["paved", "gravel", "unpaved"] as const)
        surface[k] /= distance;
    else surface.paved = 1;
    return { points, elevation, distance, ascent, descent, surface };
  }
}

function binarySearch(a: Int32Array, v: number) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v) lo = mid + 1;
    else if (a[mid] > v) hi = mid - 1;
    else return mid;
  }
  return -1;
}
