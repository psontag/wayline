import type { TrackPoint } from "./track";

export type GpxTrack = {
  /** Name from the file, if it has one. */
  name?: string;
  points: TrackPoint[];
};

// A plain scan instead of a DOM parser, so the planner stays free of DOM
// types. GPX from apps is regular enough for this.
const POINT =
  /<(?:\w+:)?(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?\1>)/g;
const LAT = /\blat\s*=\s*["']([^"']+)["']/;
const LON = /\blon\s*=\s*["']([^"']+)["']/;
const ELE = /<(?:\w+:)?ele>\s*([-\d.eE+]+)\s*</;
const NAME =
  /<(?:\w+:)?name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/(?:\w+:)?name>/;

/**
 * All track points of a GPX file, in order. Several tracks and segments
 * become one line. Route points only count when there are no track points.
 * Returns null when the text is no GPX or holds fewer than 2 points.
 */
export function parseGpx(text: string): GpxTrack | null {
  if (!/<(?:\w+:)?gpx\b/.test(text)) return null;
  const track: TrackPoint[] = [];
  const route: TrackPoint[] = [];
  for (const [, kind, attrs = "", body = ""] of text.matchAll(POINT)) {
    const lat = Number(LAT.exec(attrs)?.[1]);
    const lon = Number(LON.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = Number(ELE.exec(body)?.[1]);
    const point: TrackPoint = { coord: [lon, lat] };
    if (Number.isFinite(ele)) point.ele = ele;
    (kind === "trkpt" ? track : route).push(point);
  }
  const points = track.length ? track : route;
  if (points.length < 2) return null;
  // The first name outside the points: metadata, then track or route.
  const name = decode(NAME.exec(text.replace(POINT, ""))?.[1]?.trim() ?? "");
  return name ? { name, points } : { points };
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}
