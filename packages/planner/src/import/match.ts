import {
  bearing,
  distanceKm,
  type LonLat,
  type Surface,
} from "@wayline/domain";
import Flatbush from "flatbush";
import type { Graph } from "../graph/Graph";
import type { TrackPoint } from "./track";

/** A track point this close to a network edge lies on it. */
const MATCH_KM = 0.03;
/** The edge must run within this angle of the track, either way. */
const MAX_TURN = 45;

const KM_PER_LAT = 110.57;
const kmPerLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

type Segment = {
  a: LonLat;
  b: LonLat;
  ea: number;
  eb: number;
  edge: number;
  /** Share of the edge length at a and at b, 0 to 1. */
  sa: number;
  sb: number;
};
type SegmentIndex = { index: Flatbush; segments: Segment[] };

const indexes = new WeakMap<Graph, SegmentIndex>();

// One box per edge segment, in degrees. Built once per graph.
function segmentIndex(graph: Graph): SegmentIndex {
  let built = indexes.get(graph);
  if (built) return built;
  const segments: Segment[] = [];
  for (const [edge] of graph.edges.entries()) {
    const { coords, elevation } = graph.edgeLine(edge);
    const at = [0];
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      at.push((at.at(-1) ?? 0) + (a && b ? distanceKm(a, b) : 0));
    }
    const length = at.at(-1) || 1;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      if (!a || !b) continue;
      const ea = elevation[i - 1] ?? 0;
      segments.push({
        a,
        b,
        ea,
        eb: elevation[i] ?? ea,
        edge,
        sa: (at[i - 1] ?? 0) / length,
        sb: (at[i] ?? 0) / length,
      });
    }
  }
  const index = new Flatbush(Math.max(1, segments.length));
  for (const { a, b } of segments) {
    index.add(
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1]),
    );
  }
  if (!segments.length) index.add(0, 0, 0, 0);
  index.finish();
  built = { index, segments };
  indexes.set(graph, built);
  return built;
}

/** Offset of p from a–b in km, and where along a–b it lies (0 to 1). */
function project(p: LonLat, a: LonLat, b: LonLat) {
  const kx = kmPerLon(p[1]);
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * KM_PER_LAT;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * KM_PER_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
  return { km: Math.hypot(ax + t * dx, ay + t * dy), t };
}

/** Angle between two directions, ignoring which way they run. 0 to 90. */
function turn(x: number, y: number): number {
  const d = Math.abs(x - y) % 180;
  return Math.min(d, 180 - d);
}

/**
 * Takes surface, and elevation where the track has none, from the network
 * edges the track runs along. Points away from the network stay as they
 * are.
 */
export function matchTrack(graph: Graph, points: TrackPoint[]): TrackPoint[] {
  if (!graph.edges.length) return points;
  const { index, segments } = segmentIndex(graph);
  // Where the last point lay on its edge, for the climb in between.
  let last: { edge: number; share: number } | undefined;
  return points.map((point, i) => {
    const prev = points[i - 1] ?? point;
    const next = points[i + 1] ?? point;
    if (prev === next) {
      last = undefined;
      return point;
    }
    const heading = bearing(prev.coord, next.coord);
    const [lon, lat] = point.coord;
    const dLat = MATCH_KM / KM_PER_LAT;
    const dLon = MATCH_KM / kmPerLon(lat);
    let best: { km: number; segment: Segment; t: number } | undefined;
    for (const id of index.search(
      lon - dLon,
      lat - dLat,
      lon + dLon,
      lat + dLat,
    )) {
      const segment = segments[id];
      if (!segment) continue;
      const { km, t } = project(point.coord, segment.a, segment.b);
      if (km > MATCH_KM || (best && km >= best.km)) continue;
      if (turn(heading, bearing(segment.a, segment.b)) > MAX_TURN) continue;
      best = { km, segment, t };
    }
    const before = last;
    last = undefined;
    if (!best) return point;
    const { segment, t } = best;
    const edge = graph.edge(segment.edge);
    const surface: Surface = { ...edge.surface };
    if (point.ele !== undefined) return { ...point, surface };
    const share = segment.sa + (segment.sb - segment.sa) * t;
    last = { edge: segment.edge, share };
    const out: TrackPoint = {
      ...point,
      surface,
      ele: segment.ea + (segment.eb - segment.ea) * t,
    };
    // The edge's filtered climb for the part since the last point, so the
    // sum matches a generated trip on the same edges.
    if (before?.edge === segment.edge) {
      const part = Math.abs(share - before.share);
      const forward = share >= before.share;
      out.climb = [
        part * (forward ? edge.ascent : edge.descent),
        part * (forward ? edge.descent : edge.ascent),
      ];
    }
    return out;
  });
}
