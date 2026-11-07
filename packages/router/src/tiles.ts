// Reads the routing tiles of pipeline/routing.py. Format: pipeline/README.md.

export const COORD = 1e6;

/** Search part of one tile. Node indexes are local to the tile. */
export type SearchTile = {
  key: string;
  /** Global node ids, ascending. */
  ids: Int32Array;
  /** Degrees × 10⁶. */
  lon: Int32Array;
  lat: Int32Array;
  from: Int32Array;
  to: Int32Array;
  /** Meters. */
  length: Uint32Array;
  bits: Uint16Array;
  /** Decimeters, from → to and to → from. */
  downF: Uint16Array;
  downB: Uint16Array;
};

/** Geometry part of one tile, edges in the order of the search part. */
export type GeometryTile = {
  /** Deltas, degrees × 10⁶. The first point of an edge is relative to its from node. */
  dlon: Int32Array;
  dlat: Int32Array;
  /** First shape point of each edge, and the total at the end. */
  start: Uint32Array;
  /** Meters: from node, shape points, to node of each edge. Edge e starts at start[e] + 2e. */
  elevation: Int16Array;
};

class Reader {
  private offset = 4;
  constructor(
    private bytes: Uint8Array,
    magic: string,
  ) {
    const found = new TextDecoder().decode(bytes.subarray(0, 4));
    if (found !== magic) throw new Error(`Not a routing tile: ${found}`);
  }

  private take<T>(make: (b: ArrayBuffer) => T, size: number, count: number) {
    // Copied, so the arrays are aligned.
    const start = this.bytes.byteOffset + this.offset;
    const buffer = this.bytes.buffer.slice(start, start + size * count);
    this.offset += size * count;
    return make(buffer as ArrayBuffer);
  }

  u32 = (n: number) => this.take((b) => new Uint32Array(b), 4, n);
  i32 = (n: number) => this.take((b) => new Int32Array(b), 4, n);
  u16 = (n: number) => this.take((b) => new Uint16Array(b), 2, n);
  i16 = (n: number) => this.take((b) => new Int16Array(b), 2, n);

  end() {
    if (this.offset !== this.bytes.byteLength)
      throw new Error("Routing tile has extra bytes");
  }
}

function undelta(a: Int32Array) {
  for (let i = 1; i < a.length; i++) a[i] += a[i - 1];
  return a;
}

export function decodeSearch(key: string, bytes: Uint8Array): SearchTile {
  const r = new Reader(bytes, "WRT1");
  const [n, m] = r.u32(2);
  const tile = {
    key,
    ids: undelta(r.i32(n)),
    lon: undelta(r.i32(n)),
    lat: undelta(r.i32(n)),
    from: undelta(r.i32(m)),
    to: r.i32(m),
    length: r.u32(m),
    bits: r.u16(m),
    downF: r.u16(m),
    downB: r.u16(m),
  };
  r.end();
  return tile;
}

export function decodeGeometry(bytes: Uint8Array): GeometryTile {
  const r = new Reader(bytes, "WRG1");
  const [m, p] = r.u32(2);
  const dlon = r.i32(p);
  const dlat = r.i32(p);
  const count = r.u16(m);
  const elevation = r.i16(p + 2 * m);
  r.end();
  const start = new Uint32Array(m + 1);
  for (let e = 0; e < m; e++) start[e + 1] = start[e] + count[e];
  return { dlon, dlat, start, elevation };
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
