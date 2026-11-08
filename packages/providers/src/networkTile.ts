// Reads the network tiles of pipeline/export.py (pack_tile). Format: pipeline/README.md.
import {
  encodeLine,
  type LonLat,
  type NetworkClass,
  type NetworkEdge,
  type NetworkNode,
  type NetworkTile,
} from "@wayline/domain";

const KINDS: NetworkNode["kind"][] = ["junction", "town", "station"];
const CLASSES: NetworkClass[] = ["icn", "ncn", "rcn", "lcn", "connector"];
const NO_SCENERY = 0xffff;

class Reader {
  offset = 4;
  constructor(private bytes: Uint8Array) {
    const magic = new TextDecoder().decode(bytes.subarray(0, 4));
    if (magic !== "WNT1") throw new Error(`Not a network tile: ${magic}`);
  }

  private take<T>(make: (b: ArrayBuffer) => T, size: number, count: number) {
    // Copied, so the arrays are aligned.
    const start = this.bytes.byteOffset + this.offset;
    const buffer = this.bytes.buffer.slice(start, start + size * count);
    this.offset += size * count;
    return make(buffer as ArrayBuffer);
  }

  u8 = (n: number) => this.take((b) => new Uint8Array(b), 1, n);
  u16 = (n: number) => this.take((b) => new Uint16Array(b), 2, n);
  u32 = (n: number) => this.take((b) => new Uint32Array(b), 4, n);
  i32 = (n: number) => this.take((b) => new Int32Array(b), 4, n);

  /** n deltas as zigzag varints, summed up. */
  varints(n: number): number[] {
    const out: number[] = [];
    let prev = 0;
    for (let k = 0; k < n; k++) {
      let z = 0;
      let scale = 1;
      for (;;) {
        const byte = this.bytes[this.offset++] ?? 0;
        z += (byte & 0x7f) * scale;
        scale *= 128;
        if (byte < 0x80) break;
      }
      prev += z % 2 ? -(z + 1) / 2 : z / 2;
      out.push(prev);
    }
    return out;
  }

  text(size: number) {
    const s = new TextDecoder().decode(
      this.bytes.subarray(this.offset, this.offset + size),
    );
    this.offset += size;
    return s;
  }

  end() {
    if (this.offset !== this.bytes.byteLength)
      throw new Error("Network tile has extra bytes");
  }
}

const at = (a: ArrayLike<number>, i: number) => a[i] ?? 0;

function undelta(a: Int32Array) {
  for (let i = 1; i < a.length; i++) a[i] = at(a, i) + at(a, i - 1);
  return a;
}

/** One network tile from its unpacked bytes. */
export function decodeNetworkTile(
  key: string,
  version: string,
  bytes: Uint8Array,
): NetworkTile {
  const r = new Reader(bytes);
  const [n = 0, m = 0, p = 0, refs = 0, size = 0] = r.u32(5);
  const names = size ? r.text(size).split("\n") : [];
  const ids = undelta(r.i32(n));
  const lon = undelta(r.i32(n));
  const lat = undelta(r.i32(n));
  const kind = r.u8(n);
  const hotels = r.u16(n);
  const nameRef = r.i32(n);
  const eId = undelta(r.i32(m));
  const from = r.i32(m);
  const to = r.i32(m);
  const length = r.u32(m);
  const pavedShare = r.u16(m);
  const surface = [r.u16(m), r.u16(m), r.u16(m)] as const;
  const network = r.u8(m);
  const score = r.u16(m);
  const ascent = r.u16(m);
  const descent = r.u16(m);
  const scenery = [r.u16(m), r.u16(m), r.u16(m), r.u16(m), r.u16(m)] as const;
  const routeCount = r.u8(m);
  const counts = r.u32(m);
  const routeRefs = r.u32(refs);
  const pLon = r.varints(p);
  const pLat = r.varints(p);
  const ele = r.varints(p);
  r.end();

  const nodes: NetworkNode[] = [];
  for (let i = 0; i < n; i++) {
    const node: NetworkNode = {
      id: at(ids, i),
      lon: at(lon, i) / 1e5,
      lat: at(lat, i) / 1e5,
      kind: KINDS[at(kind, i)] ?? "junction",
      hotelCount: at(hotels, i),
    };
    const name = names[at(nameRef, i)];
    if (at(nameRef, i) >= 0 && name !== undefined) node.name = name;
    nodes.push(node);
  }
  const edges: NetworkEdge[] = [];
  let point = 0;
  let ref = 0;
  const share = (a: Uint16Array, i: number) => at(a, i) / 1000;
  for (let i = 0; i < m; i++) {
    const count = at(counts, i);
    const line: LonLat[] = [];
    for (let j = point; j < point + count; j++)
      line.push([at(pLon, j) / 1e5, at(pLat, j) / 1e5]);
    const routes: string[] = [];
    for (let j = ref; j < ref + at(routeCount, i); j++)
      routes.push(names[at(routeRefs, j)] ?? "");
    const edge: NetworkEdge = {
      id: at(eId, i),
      from: at(from, i),
      to: at(to, i),
      lengthKm: at(length, i) / 1000,
      pavedShare: share(pavedShare, i),
      surface: {
        paved: share(surface[0], i),
        gravel: share(surface[1], i),
        unpaved: share(surface[2], i),
      },
      network: CLASSES[at(network, i)] ?? "connector",
      routes,
      score: share(score, i),
      ascent: at(ascent, i),
      descent: at(descent, i),
      geometry: encodeLine(line),
      elevation: ele.slice(point, point + count),
    };
    if (at(scenery[0], i) !== NO_SCENERY)
      edge.scenery = {
        forest: share(scenery[0], i),
        water: share(scenery[1], i),
        vineyard: share(scenery[2], i),
        nature: share(scenery[3], i),
        sights: at(scenery[4], i),
      };
    edges.push(edge);
    point += count;
    ref += at(routeCount, i);
  }
  return { version, tile: key, nodes, edges };
}

/** Unpacks gzip. A host may already have unpacked it. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
