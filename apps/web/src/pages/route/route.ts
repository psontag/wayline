import type { QueryClient } from "@tanstack/react-query";
import {
  distanceKm,
  type Leg,
  type LonLat,
  type Place,
  type Profile,
  statsFromLegs,
  type Trip,
  TRIP_SCHEMA_VERSION,
} from "@wayline/domain";
import type { RoutingProvider } from "@wayline/providers";

/** Custom points are kept at 5 decimals, about 1 m. */
export function roundCoord([lon, lat]: LonLat): LonLat {
  return [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
}

export const legKey = (profile: Profile, from: LonLat, to: LonLat) =>
  ["leg", profile, ...roundCoord(from), ...roundCoord(to)] as const;

/**
 * Routes through the points, one leg per consecutive pair. Each leg is
 * cached on its own, so only legs with a changed end are routed again.
 */
export async function fetchRoute(
  client: QueryClient,
  routing: RoutingProvider,
  points: LonLat[],
  profile: Profile,
): Promise<Leg[]> {
  const pairs = points
    .slice(1)
    .map((to, i): [LonLat, LonLat] => [points[i] as LonLat, to]);
  return Promise.all(
    pairs.map(([from, to]) =>
      client.fetchQuery({
        queryKey: legKey(profile, from, to),
        staleTime: Infinity,
        queryFn: async ({ signal }) => {
          const [leg] = await routing.route([from, to], { profile, signal });
          if (!leg) throw new Error("No route");
          return leg;
        },
      }),
    ),
  );
}

/** Places near a clicked point get the town name, if one is close. */
const NAME_RADIUS_KM = 5;

/** A point picked on the map, named after the nearest place. */
export function mapPlace(coord: LonLat, places: Place[]): Place {
  const rounded = roundCoord(coord);
  let nearest: Place | undefined;
  let best = NAME_RADIUS_KM;
  for (const place of places) {
    const d = distanceKm(place.coord, rounded);
    if (d < best) {
      best = d;
      nearest = place;
    }
  }
  const name =
    nearest?.name ?? `${rounded[1].toFixed(4)}, ${rounded[0].toFixed(4)}`;
  return { name, kind: "custom", coord: rounded };
}

/** A one-stage trip from the route, ready to save. */
export function routeToTrip({
  name,
  from,
  to,
  legs,
  profile,
  now = new Date(),
  newId = () => crypto.randomUUID(),
}: {
  name: string;
  from: Place;
  to: Place;
  legs: Leg[];
  profile: Profile;
  now?: Date;
  newId?: () => string;
}): Trip {
  const stats = statsFromLegs(legs);
  const time = now.toISOString();
  return {
    schemaVersion: TRIP_SCHEMA_VERSION,
    id: newId(),
    name,
    owner: "me",
    createdAt: time,
    updatedAt: time,
    kind: "route",
    settings: {
      profile,
      kmPerDay: Math.max(1, Math.round(stats.distance / 1000)),
      maxAscentPerDay: Math.max(1, Math.round(stats.ascent)),
      startTime: "09:00",
      avgSpeed: 18,
    },
    stages: [
      {
        id: newId(),
        start: from,
        end: { ...to, locked: true, alternatives: [] },
        via: [],
        legs,
        stats,
      },
    ],
    sharedWith: [],
  };
}
