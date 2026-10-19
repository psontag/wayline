import {
  encodeLine,
  type Leg,
  type LonLat,
  type ProviderEnvelope,
  type Surface,
} from "@wayline/domain";
import { z } from "zod";

const Coordinate = z.tuple([z.number(), z.number()]).rest(z.number());

const Feature = z.object({
  geometry: z.object({ coordinates: z.array(Coordinate).min(2) }),
  properties: z.object({
    "track-length": z.coerce.number(),
    "filtered ascend": z.coerce.number(),
    /** Elevation at the end minus elevation at the start. */
    "plain-ascend": z.coerce.number(),
    /** First row is the header. */
    messages: z.array(z.array(z.string())).default([]),
  }),
});

const BrouterGeoJson = z.object({
  features: z.tuple([Feature]).rest(Feature),
});

/** Parse half: BRouter GeoJSON to a leg. */
export function parseBrouterLeg(
  envelope: ProviderEnvelope,
  from: LonLat,
  to: LonLat,
): Leg {
  const [feature] = BrouterGeoJson.parse(envelope.raw).features;
  const props = feature.properties;
  const coords = feature.geometry.coordinates;
  const ascent = Math.max(0, props["filtered ascend"]);
  let lastEle = 0;
  const elevation = coords.map((c) => (lastEle = c[2] ?? lastEle));
  return {
    from,
    to,
    geometry: encodeLine(coords.map((c) => [c[0], c[1]])),
    elevation,
    distance: props["track-length"],
    ascent,
    descent: Math.max(0, ascent - props["plain-ascend"]),
    surface: surfaceShares(props.messages),
    provider: envelope.provider,
    profileHash: envelope.profileHash,
  };
}

/** Shares by distance, from the way tags in BRouter's messages table. */
function surfaceShares(messages: string[][]): Surface {
  const [header, ...rows] = messages;
  const distanceCol = header?.indexOf("Distance") ?? -1;
  const tagsCol = header?.indexOf("WayTags") ?? -1;
  const sums: Surface = { paved: 0, gravel: 0, unpaved: 0 };
  let total = 0;
  if (distanceCol >= 0 && tagsCol >= 0) {
    for (const row of rows) {
      const meters = Number(row[distanceCol]);
      if (!(meters > 0)) continue;
      sums[surfaceOf(row[tagsCol] ?? "")] += meters;
      total += meters;
    }
  }
  if (!total) return { paved: 1, gravel: 0, unpaved: 0 };
  return {
    paved: sums.paved / total,
    gravel: sums.gravel / total,
    unpaved: sums.unpaved / total,
  };
}

const pavedSurfaces = new Set([
  "paved",
  "asphalt",
  "chipseal",
  "concrete",
  "concrete:plates",
  "concrete:lanes",
  "paving_stones",
  "sett",
  "cobblestone",
  "unhewn_cobblestone",
  "metal",
  "wood",
]);
const gravelSurfaces = new Set([
  "gravel",
  "fine_gravel",
  "compacted",
  "pebblestone",
]);

/** Surface type of a way, e.g. from "highway=track tracktype=grade2". */
export function surfaceOf(wayTags: string): keyof Surface {
  const tags = new Map(
    wayTags.split(" ").map((t) => t.split("=", 2) as [string, string]),
  );
  const surface = tags.get("surface");
  if (surface) {
    if (pavedSurfaces.has(surface)) return "paved";
    if (gravelSurfaces.has(surface)) return "gravel";
    return "unpaved";
  }
  // No surface tag: guess from the track grade and the way type.
  switch (tags.get("tracktype")) {
    case "grade1":
      return "paved";
    case "grade2":
      return "gravel";
    case "grade3":
    case "grade4":
    case "grade5":
      return "unpaved";
  }
  switch (tags.get("highway")) {
    case "track":
    case "path":
      return "gravel";
    case "bridleway":
      return "unpaved";
    default:
      return "paved";
  }
}
