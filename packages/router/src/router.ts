import type { LonLat, RoutingTiles, Surface } from "@wayline/domain";
import FlatQueue from "flatqueue";
import {
  type CostProfile,
  FERRY_COST,
  TOURING,
  TURN_COST,
  bitsOf,
  surfaceOf,
  wayFactor,
} from "./cost";
import {
  at,
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
  adjFerry: Uint8Array;
  geometry?: Promise<GeometryTile | undefined>;
  /** Bounding box of each edge with its shape: min lon, min lat, max lon, max lat. */
  boxes?: Int32Array;
};

type Step = { tile: Tile; entry: number };

/** A point on an edge. f is the share of the edge from its from node. */
type OnEdge = { tile: Tile; e: number; f: number; point: LonLat };

/** Part of an edge, from share f0 to share f1. */
type Piece = { tile: Tile; e: number; f0: number; f1: number };

/** Points of an edge from its from node to its to node. */
type Shape = {
  points: LonLat[];
  elevation: number[];
  /** Meters from the from node, one per point. */
  along: number[];
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
    private profile: CostProfile = TOURING,
  ) {
    this.keys = new Set(index.keys);
  }

  /** Same arithmetic as tile_of in pipeline/routing.py. */
  private keyOf(lon: number, lat: number) {
    const size = this.index.size;
    return `${Math.floor(lon / COORD / size)}_${Math.floor(lat / COORD / size)}`;
  }

  private slot(ref: number): Tile {
    const tile = this.slots[Math.floor(ref / SLOT)];
    if (!tile) throw new Error("Unknown tile slot");
    return tile;
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

  /** Whether edge e can be ridden in a direction. */
  private static open(s: SearchTile, e: number, forward: boolean) {
    const b = bitsOf(at(s.bits, e));
    return (forward ? b.forward : b.backward) === 1;
  }

  /** Cost of riding all of edge e in a direction. */
  private edgeCost(s: SearchTile, e: number, forward: boolean) {
    const factor = wayFactor(
      at(s.bits, e),
      this.index.highways,
      this.profile,
      at(s.estimates, e),
    );
    const down = (forward ? at(s.downF, e) : at(s.downB, e)) / 10;
    return Math.max(
      1,
      at(s.length, e) * factor + this.profile.downhillCost * down,
    );
  }

  private adjacency(s: SearchTile): Tile {
    const n = s.ids.length;
    const m = s.from.length;
    const owned = new Uint8Array(n);
    for (let i = 0; i < n; i++)
      owned[i] = this.keyOf(at(s.lon, i), at(s.lat, i)) === s.key ? 1 : 0;
    const usable = (e: number, forward: boolean) => {
      const node = forward ? at(s.from, e) : at(s.to, e);
      return owned[node] === 1 && Router.open(s, e, forward);
    };
    const adjStart = new Int32Array(n + 1);
    const bump = (i: number) => (adjStart[i] = at(adjStart, i) + 1);
    for (let e = 0; e < m; e++) {
      if (usable(e, true)) bump(at(s.from, e) + 1);
      if (usable(e, false)) bump(at(s.to, e) + 1);
    }
    for (let i = 0; i < n; i++)
      adjStart[i + 1] = at(adjStart, i + 1) + at(adjStart, i);
    const size = at(adjStart, n);
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
      adjFerry: new Uint8Array(size),
    };
    const ferry = this.index.highways.indexOf("ferry");
    const fill = adjStart.slice(0, n);
    for (let e = 0; e < m; e++) {
      const bits = at(s.bits, e);
      const isFerry = bitsOf(bits).highway === ferry ? 1 : 0;
      // No turn cost on signed routes makes them a bit more magnetic, as in BRouter.
      const signed = this.profile.cycleRoutes ? bitsOf(bits).signed : 0;
      for (const forward of [true, false]) {
        if (!usable(e, forward)) continue;
        const a = forward ? at(s.from, e) : at(s.to, e);
        const b = forward ? at(s.to, e) : at(s.from, e);
        const i = at(fill, a);
        fill[a] = i + 1;
        tile.adjTo[i] = b;
        tile.adjEdge[i] = e;
        tile.adjForward[i] = forward ? 1 : 0;
        tile.adjCost[i] = this.edgeCost(s, e, forward);
        tile.adjBearing[i] = Math.atan2(
          at(s.lat, b) - at(s.lat, a),
          (at(s.lon, b) - at(s.lon, a)) *
            Math.cos((at(s.lat, a) / COORD) * (Math.PI / 180)),
        );
        tile.adjSigned[i] = signed;
        tile.adjFerry[i] = isFerry;
      }
    }
    this.slots.push(tile);
    return tile;
  }

  /** The tile that owns a node, and its index there. */
  private async owner(
    tile: Tile,
    local: number,
  ): Promise<{ tile: Tile; local: number } | undefined> {
    if (tile.owned[local]) return { tile, local };
    const s = tile.s;
    const other = await this.load(
      this.keyOf(at(s.lon, local), at(s.lat, local)),
    );
    if (!other) return undefined;
    const i = binarySearch(other.s.ids, at(s.ids, local));
    return i < 0 ? undefined : { tile: other, local: i };
  }

  private geometry(tile: Tile) {
    tile.geometry ??= this.bytes(
      this.index.geometry.replace("{key}", tile.s.key),
    ).then((b) => b && decodeGeometry(b));
    return tile.geometry;
  }

  private shape(tile: Tile, g: GeometryTile | undefined, e: number): Shape {
    const s = tile.s;
    let x = at(s.lon, at(s.from, e));
    let y = at(s.lat, at(s.from, e));
    const points: LonLat[] = [[x / COORD, y / COORD]];
    const elevation: number[] = [];
    if (g) {
      const first = at(g.start, e);
      const last = at(g.start, e + 1);
      for (let j = first; j < last; j++) {
        x += at(g.dlon, j);
        y += at(g.dlat, j);
        points.push([x / COORD, y / COORD]);
      }
      for (let j = first + 2 * e; j < last + 2 * e + 2; j++)
        elevation.push(at(g.elevation, j));
    }
    const to = at(s.to, e);
    points.push([at(s.lon, to) / COORD, at(s.lat, to) / COORD]);
    while (elevation.length < points.length)
      elevation.push(elevation.at(-1) ?? 0);
    const along = [0];
    for (let j = 1; j < points.length; j++) {
      const [lon1, lat1] = points[j - 1] as LonLat;
      const [lon2, lat2] = points[j] as LonLat;
      along.push(at(along, j - 1) + meters(lon1, lat1, lon2, lat2));
    }
    return { points, elevation, along };
  }

  private boxes(tile: Tile, g: GeometryTile | undefined): Int32Array {
    if (tile.boxes) return tile.boxes;
    const s = tile.s;
    const m = s.from.length;
    const boxes = new Int32Array(4 * m);
    for (let e = 0; e < m; e++) {
      const f = at(s.from, e);
      const t = at(s.to, e);
      let x = at(s.lon, f);
      let y = at(s.lat, f);
      let [x0, y0, x1, y1] = [x, y, x, y];
      const grow = (px: number, py: number) => {
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      };
      grow(at(s.lon, t), at(s.lat, t));
      if (g)
        for (let j = at(g.start, e); j < at(g.start, e + 1); j++) {
          x += at(g.dlon, j);
          y += at(g.dlat, j);
          grow(x, y);
        }
      boxes.set([x0, y0, x1, y1], 4 * e);
    }
    tile.boxes = boxes;
    return boxes;
  }

  /** Nearest point on any edge, within maxM. */
  private async onEdge(
    [lon, lat]: LonLat,
    maxM: number,
  ): Promise<OnEdge | undefined> {
    let best: OnEdge | undefined;
    let bestM = maxM;
    const cos = Math.cos((lat * Math.PI) / 180);
    const dLat = maxM / M_PER_DEG;
    const dLon = dLat / cos;
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
      const g = await this.geometry(tile);
      const boxes = this.boxes(tile, g);
      for (let e = 0; e < tile.s.from.length; e++) {
        // Box test with the best distance so far.
        const rLat = (bestM / M_PER_DEG) * COORD;
        const rLon = rLat / cos;
        const x = lon * COORD;
        const y = lat * COORD;
        if (
          x < at(boxes, 4 * e) - rLon ||
          y < at(boxes, 4 * e + 1) - rLat ||
          x > at(boxes, 4 * e + 2) + rLon ||
          y > at(boxes, 4 * e + 3) + rLat
        )
          continue;
        const sh = this.shape(tile, g, e);
        const total = at(sh.along, sh.along.length - 1);
        for (let j = 1; j < sh.points.length; j++) {
          const [ax, ay] = sh.points[j - 1] as LonLat;
          const [bx, by] = sh.points[j] as LonLat;
          // Local meters around the point.
          const px = (ax - lon) * M_PER_DEG * cos;
          const py = (ay - lat) * M_PER_DEG;
          const qx = (bx - lon) * M_PER_DEG * cos;
          const qy = (by - lat) * M_PER_DEG;
          const dx = qx - px;
          const dy = qy - py;
          const len2 = dx * dx + dy * dy;
          const t =
            len2 > 0
              ? Math.min(1, Math.max(0, -(px * dx + py * dy) / len2))
              : 0;
          const d = Math.hypot(px + t * dx, py + t * dy);
          if (d >= bestM) continue;
          bestM = d;
          const seg = at(sh.along, j) - at(sh.along, j - 1);
          best = {
            tile,
            e,
            f: total > 0 ? (at(sh.along, j - 1) + t * seg) / total : 0,
            point: [ax + t * (bx - ax), ay + t * (by - ay)],
          };
        }
      }
    }
    return best;
  }

  /** Nearest point on a bikeable way, within maxM meters. */
  async snap(point: LonLat, maxM = SNAP_M): Promise<LonLat | undefined> {
    return (await this.onEdge(point, maxM))?.point;
  }

  /** Cheapest route between two points, or undefined if there is none. */
  async route(
    from: LonLat,
    to: LonLat,
    { signal, maxSettled = 3_000_000 }: RouteOptions = {},
  ): Promise<RoutedLeg | undefined> {
    const [a, b] = await Promise.all([
      this.onEdge(from, SNAP_M),
      this.onEdge(to, SNAP_M),
    ]);
    if (!a || !b) return undefined;
    const [tLon, tLat] = b.point;

    const cost = new Map<number, number>();
    /** Where a node was seen: slot × SLOT + local index. */
    const where = new Map<number, number>();
    /** Entry used to reach a node: slot × SLOT + entry index. None for the start nodes. */
    const via = new Map<number, number>();
    const done = new Set<number>();
    const queue = new FlatQueue<number>();

    // The search starts at both ends of the start edge, with the cost of the part to them.
    const sa = a.tile.s;
    for (const forward of [true, false]) {
      if (!Router.open(sa, a.e, forward)) continue;
      const node = forward ? at(sa.to, a.e) : at(sa.from, a.e);
      const id = at(sa.ids, node);
      const c = (forward ? 1 - a.f : a.f) * this.edgeCost(sa, a.e, forward);
      if (c >= (cost.get(id) ?? Infinity)) continue;
      cost.set(id, c);
      where.set(id, a.tile.slot * SLOT + node);
      queue.push(
        id,
        c +
          meters(
            at(sa.lon, node) / COORD,
            at(sa.lat, node) / COORD,
            tLon,
            tLat,
          ),
      );
    }
    // It ends at either end of the target edge, plus the cost of the part from there.
    const sb = b.tile.s;
    const extra = new Map<number, number>();
    for (const forward of [true, false]) {
      if (!Router.open(sb, b.e, forward)) continue;
      const id = at(sb.ids, forward ? at(sb.from, b.e) : at(sb.to, b.e));
      const c = (forward ? b.f : 1 - b.f) * this.edgeCost(sb, b.e, forward);
      extra.set(id, Math.min(c, extra.get(id) ?? Infinity));
    }
    let best = Infinity;
    /** Node where the best route leaves the graph. None: along the start edge only. */
    let bestEnd: number | undefined;
    if (sameEdge(a, b)) {
      const forward = b.f >= a.f;
      if (Router.open(sa, a.e, forward))
        best = Math.abs(b.f - a.f) * this.edgeCost(sa, a.e, forward);
    }

    while (queue.length && done.size < maxSettled) {
      if (signal?.aborted) return undefined;
      if ((queue.peekValue() ?? Infinity) >= best) break;
      const u = queue.pop();
      if (u === undefined || done.has(u)) continue;
      done.add(u);
      const cu = cost.get(u) ?? 0;
      const x = extra.get(u);
      if (x !== undefined && cu + x < best) {
        best = cu + x;
        bestEnd = u;
      }
      const ref = where.get(u) ?? 0;
      const found = await this.owner(this.slot(ref), ref % SLOT);
      if (!found) continue;
      const { tile, local } = found;
      const s = tile.s;
      const prev = via.get(u);
      const inBearing =
        prev === undefined
          ? undefined
          : at(this.slot(prev).adjBearing, prev % SLOT);
      const onFerry =
        prev !== undefined && this.slot(prev).adjFerry[prev % SLOT] === 1;
      const end = at(tile.adjStart, local + 1);
      for (let i = at(tile.adjStart, local); i < end; i++) {
        const bn = at(tile.adjTo, i);
        const v = at(s.ids, bn);
        if (done.has(v)) continue;
        let c = cu + at(tile.adjCost, i);
        if (inBearing !== undefined && !tile.adjSigned[i])
          c += TURN_COST * (1 - Math.cos(at(tile.adjBearing, i) - inBearing));
        if (tile.adjFerry[i] && !onFerry) c += FERRY_COST;
        if (c < (cost.get(v) ?? Infinity)) {
          cost.set(v, c);
          where.set(v, tile.slot * SLOT + bn);
          via.set(v, tile.slot * SLOT + i);
          const h = meters(
            at(s.lon, bn) / COORD,
            at(s.lat, bn) / COORD,
            tLon,
            tLat,
          );
          queue.push(v, c + h);
        }
      }
    }
    if (best === Infinity) return undefined;
    if (bestEnd === undefined)
      return this.leg([{ tile: a.tile, e: a.e, f0: a.f, f1: b.f }]);

    const steps: Step[] = [];
    let v = bestEnd;
    for (let ref = via.get(v); ref !== undefined; ref = via.get(v)) {
      const tile = this.slot(ref);
      const entry = ref % SLOT;
      steps.push({ tile, entry });
      const e = at(tile.adjEdge, entry);
      const prevNode = tile.adjForward[entry]
        ? at(tile.s.from, e)
        : at(tile.s.to, e);
      v = at(tile.s.ids, prevNode);
    }
    steps.reverse();
    const startAtTo = v === at(sa.ids, at(sa.to, a.e));
    const endAtFrom = bestEnd === at(sb.ids, at(sb.from, b.e));
    return this.leg([
      { tile: a.tile, e: a.e, f0: a.f, f1: startAtTo ? 1 : 0 },
      ...steps.map(({ tile, entry }) => {
        const forward = tile.adjForward[entry] === 1;
        return {
          tile,
          e: at(tile.adjEdge, entry),
          f0: forward ? 0 : 1,
          f1: forward ? 1 : 0,
        };
      }),
      { tile: b.tile, e: b.e, f0: endAtFrom ? 0 : 1, f1: b.f },
    ]);
  }

  private async leg(pieces: Piece[]): Promise<RoutedLeg> {
    const geometries = await Promise.all(
      pieces.map((p) => this.geometry(p.tile)),
    );
    const points: LonLat[] = [];
    const elevation: number[] = [];
    const surface: Surface = { paved: 0, gravel: 0, unpaved: 0 };
    let distance = 0;
    pieces.forEach(({ tile, e, f0, f1 }, k) => {
      const part = cut(this.shape(tile, geometries[k], e), f0, f1);
      part.points.forEach((p, j) => {
        const last = points.at(-1);
        if (last && last[0] === p[0] && last[1] === p[1]) return;
        points.push(p);
        elevation.push(at(part.elevation, j));
      });
      const length = Math.abs(f1 - f0) * at(tile.s.length, e);
      distance += length;
      surface[surfaceOf(at(tile.s.bits, e), this.index.highways)] += length;
    });
    let ascent = 0;
    let descent = 0;
    for (let j = 1; j < elevation.length; j++) {
      const d = at(elevation, j) - at(elevation, j - 1);
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

/** Whether two points lie on the same edge. An edge is in the tiles of both its ends. */
function sameEdge(a: OnEdge, b: OnEdge) {
  const ends = (p: OnEdge) => {
    const s = p.tile.s;
    return [
      at(s.ids, at(s.from, p.e)),
      at(s.ids, at(s.to, p.e)),
      at(s.length, p.e),
    ];
  };
  const [x, y] = [ends(a), ends(b)];
  return x.every((v, i) => v === y[i]);
}

/** The part of a shape from share f0 to share f1, with points at both ends. */
function cut(sh: Shape, f0: number, f1: number) {
  const total = at(sh.along, sh.along.length - 1);
  const lo = Math.min(f0, f1) * total;
  const hi = Math.max(f0, f1) * total;
  const pointAt = (d: number): [LonLat, number] => {
    let j = 1;
    while (j < sh.along.length - 1 && at(sh.along, j) < d) j++;
    const d0 = at(sh.along, j - 1);
    const d1 = at(sh.along, j);
    const t = d1 > d0 ? Math.min(1, Math.max(0, (d - d0) / (d1 - d0))) : 0;
    const [ax, ay] = sh.points[j - 1] as LonLat;
    const [bx, by] = sh.points[j] as LonLat;
    const ea = at(sh.elevation, j - 1);
    const eb = at(sh.elevation, j);
    return [[ax + t * (bx - ax), ay + t * (by - ay)], ea + t * (eb - ea)];
  };
  const [p0, e0] = pointAt(lo);
  const [p1, e1] = pointAt(hi);
  const points: LonLat[] = [p0];
  const elevation = [e0];
  for (let j = 0; j < sh.points.length; j++) {
    const d = at(sh.along, j);
    if (d > lo && d < hi) {
      points.push(sh.points[j] as LonLat);
      elevation.push(at(sh.elevation, j));
    }
  }
  points.push(p1);
  elevation.push(e1);
  if (f1 < f0) {
    points.reverse();
    elevation.reverse();
  }
  return { points, elevation };
}

function binarySearch(a: Int32Array, v: number) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const x = at(a, mid);
    if (x < v) lo = mid + 1;
    else if (x > v) hi = mid - 1;
    else return mid;
  }
  return -1;
}
