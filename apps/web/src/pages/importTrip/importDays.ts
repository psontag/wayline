import {
  type BBox,
  distanceKm,
  type GeoTown,
  type Hotel,
  type HotelBudget,
  type Leg,
  type LonLat,
  type Place,
  type Profile,
  type Trip,
} from "@wayline/domain";
import {
  bboxAround,
  type Graph,
  hasElevation,
  type ImportedDay,
  importedTrip,
  matchTrack,
  offNetworkKm,
  parseGpx,
  simplifyTrack,
  type TrackPoint,
  trackLegs,
} from "@wayline/planner";

/** One GPX file, read and matched to the route network. */
export type ImportFile = {
  id: string;
  fileName: string;
  /** Name inside the file, if any. */
  name?: string;
  points: TrackPoint[];
  /** Simplified line for the map. */
  preview: LonLat[];
  /** Meters, for the list. */
  distance: number;
  ascent: number;
  hasElevation: boolean;
  /** Meters away from the route network. */
  offNetwork: number;
};

export type ReadResult =
  { ok: true; file: ImportFile } | { ok: false; fileName: string };

/** A day that starts further than this from the last stop gets a routed gap. */
export const GAP_KM = 0.2;
/** Stops are named after a town this close. */
const TOWN_KM = 3;

export async function readImportFile(
  file: File,
  graph: (bbox: BBox) => Promise<Graph>,
): Promise<ReadResult> {
  const gpx = parseGpx(await file.text());
  if (!gpx) return { ok: false, fileName: file.name };
  const network = await graph(
    bboxAround(
      gpx.points.map((p) => p.coord),
      0.5,
    ),
  );
  const points = matchTrack(network, gpx.points);
  const legs = trackLegs(points, "touring");
  return {
    ok: true,
    file: {
      id: crypto.randomUUID(),
      fileName: file.name,
      ...(gpx.name ? { name: gpx.name } : {}),
      points,
      preview: simplifyTrack(points, 0.02).map((p) => p.coord),
      distance: legs.reduce((sum, leg) => sum + leg.distance, 0),
      ascent: legs.reduce((sum, leg) => sum + leg.ascent, 0),
      hasElevation: hasElevation(gpx.points),
      offNetwork: Math.round(offNetworkKm(points) * 1000),
    },
  };
}

/** By file name, with numbers in order: day2 before day10. */
export function byFileName(a: ImportFile, b: ImportFile): number {
  return a.fileName.localeCompare(b.fileName, undefined, { numeric: true });
}

/** Km between the end of the day before and the start of this one. */
export function gapBefore(files: ImportFile[], index: number): number {
  const end = files[index - 1]?.points.at(-1)?.coord;
  const start = files[index]?.points[0]?.coord;
  return end && start ? distanceKm(end, start) : 0;
}

/** Nearest town within TOWN_KM. */
export function townNear(towns: GeoTown[], coord: LonLat): GeoTown | undefined {
  let best: { town: GeoTown; km: number } | undefined;
  for (const town of towns) {
    // Cheap box test first: about TOWN_KM in degrees.
    if (Math.abs(town.lat - coord[1]) > 0.03) continue;
    if (Math.abs(town.lon - coord[0]) > 0.05) continue;
    const km = distanceKm(coord, [town.lon, town.lat]);
    if (km <= TOWN_KM && (!best || km < best.km)) best = { town, km };
  }
  return best?.town;
}

export type ImportOptions = {
  name: string;
  profile: Profile;
  hotelBudget?: HotelBudget;
  startDate?: string;
  startTime: string;
};

export type ImportTools = {
  towns: GeoTown[];
  route: (points: LonLat[], profile: Profile) => Promise<Leg[]>;
  hotelNear: (
    coord: LonLat,
    budget: HotelBudget | undefined,
    route: LonLat[],
  ) => Promise<Hotel | undefined>;
  /** Name of a place without a town nearby, e.g. "End of day 2". */
  fallbackName: (day: number) => string;
};

/**
 * The trip from the files in order. A day that starts away from the last
 * stop starts there anyway, with the gap routed.
 */
export async function buildImportTrip(
  files: ImportFile[],
  options: ImportOptions,
  tools: ImportTools,
): Promise<Trip> {
  const place = (coord: LonLat, day: number): Place => ({
    name: townNear(tools.towns, coord)?.name ?? tools.fallbackName(day),
    kind: "custom",
    coord,
  });
  const days: ImportedDay[] = [];
  for (const [i, file] of files.entries()) {
    const first = file.points[0]?.coord;
    const last = file.points.at(-1)?.coord;
    if (!first || !last) continue;
    let legs = trackLegs(file.points, options.profile);
    const before = days.at(-1)?.end;
    if (before && gapBefore(files, i) > GAP_KM) {
      const gap = await tools.route([before.coord, first], options.profile);
      legs = [...gap, ...legs];
    }
    const end = place(last, i + 1);
    const isLast = i === files.length - 1;
    const hotel = isLast
      ? undefined
      : await tools.hotelNear(last, options.hotelBudget, file.preview);
    days.push({
      start: before ?? place(first, 0),
      end,
      legs,
      ...(hotel ? { hotel } : {}),
    });
  }
  return importedTrip({
    id: crypto.randomUUID(),
    now: new Date(),
    days,
    ...options,
  });
}
