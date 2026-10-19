import { type LonLat, routePoints, type Trip } from "@wayline/domain";

/**
 * GPX 1.1 of a trip: one waypoint per start and stop, one track with one
 * segment per stage. Elevation in m on each track point.
 */
export function tripToGpx(trip: Trip): string {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Wayline" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escape(trip.name)}</name></metadata>`,
  ];
  const first = trip.stages[0];
  if (first) out.push(wpt(first.start.coord, first.start.name));
  for (const s of trip.stages) out.push(wpt(s.end.coord, s.end.name));

  out.push(`  <trk><name>${escape(trip.name)}</name>`);
  for (const s of trip.stages) {
    out.push("    <trkseg>");
    for (const p of routePoints(s.legs)) {
      out.push(
        `      <trkpt lat="${p.coord[1]}" lon="${p.coord[0]}"><ele>${Math.round(p.ele)}</ele></trkpt>`,
      );
    }
    out.push("    </trkseg>");
  }
  out.push("  </trk>", "</gpx>", "");
  return out.join("\n");
}

/** File name from the trip name, e.g. "bamberg-kulmbach.gpx". */
export function gpxFileName(trip: Trip): string {
  const slug = trip.name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "trip"}.gpx`;
}

function wpt([lon, lat]: LonLat, name: string): string {
  return `  <wpt lat="${lat}" lon="${lon}"><name>${escape(name)}</name></wpt>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
