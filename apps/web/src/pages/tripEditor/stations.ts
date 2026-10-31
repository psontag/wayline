import {
  bahnUrl,
  decodeLine,
  distanceKm,
  type GeoStation,
  type LonLat,
  type Trip,
} from "@wayline/domain";
import { useMemo } from "react";
import { useHomeStation } from "../../data/homeStation";
import { usePlaceIndex } from "./stopChoices";

/** Stations this close to the route count as on the way. */
export const STATION_NEAR_KM = 2;
/** Grid cell in degrees, a bit more than STATION_NEAR_KM. */
const CELL = 0.03;

export type RouteStation = { id: string; name: string; coord: LonLat };

/**
 * Stations within STATION_NEAR_KM of the route, in route order. Stations
 * at the start or end of the route are left out: they have their own
 * markers.
 */
export function stationsNear(
  stations: GeoStation[],
  route: LonLat[],
): RouteStation[] {
  const first = route[0];
  const last = route.at(-1);
  if (!first || !last) return [];

  // Route point indexes by grid cell, so each station checks only its
  // neighbourhood.
  const key = (x: number, y: number) => `${x},${y}`;
  const grid = new Map<string, number[]>();
  route.forEach(([lon, lat], i) => {
    const k = key(Math.floor(lon / CELL), Math.floor(lat / CELL));
    const list = grid.get(k) ?? [];
    list.push(i);
    grid.set(k, list);
  });

  const found: { station: RouteStation; at: number }[] = [];
  for (const s of stations) {
    const coord: LonLat = [s.lon, s.lat];
    if (
      distanceKm(coord, first) < STATION_NEAR_KM ||
      distanceKm(coord, last) < STATION_NEAR_KM
    ) {
      continue;
    }
    const cx = Math.floor(s.lon / CELL);
    const cy = Math.floor(s.lat / CELL);
    let at: number | undefined;
    for (let dx = -1; dx <= 1 && at === undefined; dx++) {
      for (let dy = -1; dy <= 1 && at === undefined; dy++) {
        at = grid.get(key(cx + dx, cy + dy))?.find((i) => {
          const p = route[i];
          return !!p && distanceKm(coord, p) < STATION_NEAR_KM;
        });
      }
    }
    if (at !== undefined) {
      found.push({ station: { id: s.id, name: s.name, coord }, at });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.station);
}

export type MapStation = RouteStation & { href: string };

/** Stations along the trip, each with a bahn.de link home. */
export function useRouteStations(trip: Trip): MapStation[] {
  const places = usePlaceIndex();
  const [home] = useHomeStation();
  return useMemo(() => {
    if (!places) return [];
    const route = trip.stages.flatMap((stage) =>
      stage.legs.flatMap((leg) => decodeLine(leg.geometry)),
    );
    return stationsNear(places.stations, route).map((s) => ({
      ...s,
      href: bahnUrl({ from: s.name, to: home }),
    }));
  }, [trip.stages, places, home]);
}
