import {
  type BBox,
  distanceKm,
  type GenerateRequest,
  type Place,
} from "@wayline/domain";
import { type NewTripValues, toRequest, type TripShape } from "./form";

/** Trip shapes on the Area step. Any tries loops and one way trips. */
export const areaShapes = ["any", "loop", "oneWay"] as const;
export type AreaShape = (typeof areaShapes)[number];

/** Starts tried for "Any station": fewer with "Any" shape, as it runs twice. */
const STARTS = { one: 3, both: 2 };

/** Starts closer than this give nearly the same trips. */
const MIN_START_GAP_KM = 15;

/** Room around the area, so routes along its border still fit. */
const MARGIN_KM = 10;

/** The form shape for a loop or one way trip of this length. */
export function formShape(
  shape: Exclude<AreaShape, "any">,
  length: NewTripValues["length"],
): TripShape {
  if (shape === "loop") return "loop";
  // One day one way without an end is an open ride.
  return length === "one" ? "open" : "ab";
}

/**
 * Requests for "Show trips": the picked start, or the fastest stations
 * spread over the area, each with the shape. "Any" tries a loop and a one
 * way trip from each. With the area's bbox, routes stay near the area.
 */
export function areaRequests(
  values: NewTripValues,
  stations: Place[],
  picked: Place | undefined,
  shape: AreaShape,
  bbox?: BBox,
): GenerateRequest[] {
  const shapes: Exclude<AreaShape, "any">[] =
    shape === "any" ? ["loop", "oneWay"] : [shape];
  const starts = picked
    ? [picked]
    : spreadStarts(stations, shape === "any" ? STARTS.both : STARTS.one);
  return starts.flatMap((start) =>
    shapes.map((s) => {
      const request = toRequest({
        ...values,
        start,
        end: null,
        shape: formShape(s, values.length),
      });
      return bbox ? { ...request, region: areaRegion(bbox, request) } : request;
    }),
  );
}

/**
 * Up to count stations in list order, skipping ones close to a station
 * already taken. Falls back to close ones when too few are far apart.
 */
export function spreadStarts(stations: Place[], count: number): Place[] {
  const taken: Place[] = [];
  for (const s of stations) {
    if (taken.length >= count) break;
    if (taken.every((t) => distanceKm(t.coord, s.coord) >= MIN_START_GAP_KM)) {
      taken.push(s);
    }
  }
  for (const s of stations) {
    if (taken.length >= count) break;
    if (!taken.includes(s)) taken.push(s);
  }
  return taken;
}

/**
 * The area's bbox, grown so the trip fits: a loop of L km needs about
 * L / 3 across, a one way trip without an end about 0.6 L.
 */
export function areaRegion(bbox: BBox, request: GenerateRequest): BBox {
  const [w, s, e, n] = bbox;
  const totalKm = request.days * request.kmPerDay;
  const span = request.kind === "one-way" ? totalKm * 0.6 : totalKm / 3;
  const kmPerLat = 111.2;
  const kmPerLon = kmPerLat * Math.cos((((s + n) / 2) * Math.PI) / 180);
  const grow = (sideKm: number) =>
    Math.max(MARGIN_KM, (span - sideKm) / 2 + MARGIN_KM);
  const dLon = grow((e - w) * kmPerLon) / kmPerLon;
  const dLat = grow((n - s) * kmPerLat) / kmPerLat;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return [round(w - dLon), round(s - dLat), round(e + dLon), round(n + dLat)];
}
