import {
  distanceKm,
  type LonLat,
  type Profile,
  type ProviderEnvelope,
} from "@wayline/domain";

/**
 * Fetch half of a fake router: a straight line in BRouter's GeoJSON shape,
 * so parseBrouterLeg reads it. Deterministic for any input.
 */
export function fakeBrouterLeg(
  from: LonLat,
  to: LonLat,
  profile: Profile,
): ProviderEnvelope {
  const km = distanceKm(from, to);
  const steps = Math.max(1, Math.ceil(km));
  const coordinates: [number, number, number][] = [];
  let ascent = 0;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const lon = from[0] + (to[0] - from[0]) * f;
    const lat = from[1] + (to[1] - from[1]) * f;
    // Gentle hills, the same for the same place.
    const ele = Math.round(
      300 + 40 * Math.sin(lon * 20) + 40 * Math.cos(lat * 20),
    );
    const prev = coordinates.at(-1);
    if (prev) ascent += Math.max(0, ele - prev[2]);
    coordinates.push([round(lon, 6), round(lat, 6), ele]);
  }
  const net = (coordinates.at(-1)?.[2] ?? 0) - (coordinates[0]?.[2] ?? 0);
  const meters = Math.round(km * 1000);
  return {
    provider: "fake",
    profileHash: `fake-${profile}`,
    raw: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            "track-length": String(meters),
            "filtered ascend": String(Math.round(ascent)),
            "plain-ascend": String(Math.round(net)),
            messages: [
              ["Longitude", "Latitude", "Elevation", "Distance", "WayTags"],
              [
                "0",
                "0",
                "0",
                String(meters),
                "highway=cycleway surface=asphalt",
              ],
            ],
          },
          geometry: { type: "LineString", coordinates },
        },
      ],
    },
  };
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
