import type { GenerateRequest, Place } from "@wayline/domain";
import { type NewTripValues, toRequest, type TripShape } from "./form";

/** Trip shapes on the Area step. Any tries loops and one way trips. */
export const areaShapes = ["any", "loop", "oneWay"] as const;
export type AreaShape = (typeof areaShapes)[number];

/** Starts tried for "Any station": fewer with "Any" shape, as it runs twice. */
const STARTS = { one: 3, both: 2 };

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
 * Requests for "Show trips": the picked start, or the fastest stations, each
 * with the shape. "Any" tries a loop and a one way trip from each.
 */
export function areaRequests(
  values: NewTripValues,
  stations: Place[],
  picked: Place | undefined,
  shape: AreaShape,
): GenerateRequest[] {
  const shapes: Exclude<AreaShape, "any">[] =
    shape === "any" ? ["loop", "oneWay"] : [shape];
  const starts = picked
    ? [picked]
    : stations.slice(0, shape === "any" ? STARTS.both : STARTS.one);
  return starts.flatMap((start) =>
    shapes.map((s) =>
      toRequest({
        ...values,
        start,
        end: null,
        shape: formShape(s, values.length),
      }),
    ),
  );
}
