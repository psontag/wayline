import { distanceKm, type Place, type Places } from "@wayline/domain";

/** A trip starts or ends at a station this close to the chosen town. */
export const STATION_KM = 2;

const PLACE_RANK = { city: 0, town: 1, village: 2 };

/**
 * Towns and stations on the route network. Towns first, bigger ones
 * first, so an empty search shows well-known towns.
 */
export function placeOptions(places: Places): Place[] {
  const stations = places.stations
    .filter((s) => s.nodeId !== null)
    .map((s): Place => ({
      name: s.name,
      kind: "station",
      coord: [s.lon, s.lat],
      osmId: s.id,
    }));
  const towns = places.towns
    .filter((t) => t.nodeId !== null)
    .sort(
      (a, b) =>
        PLACE_RANK[a.place] - PLACE_RANK[b.place] ||
        b.hotelCount - a.hotelCount,
    )
    .map((t): Place => ({
      name: t.name,
      kind: "town",
      coord: [t.lon, t.lat],
      osmId: t.id,
    }));
  return [...towns, ...stations];
}

/** The nearest station within STATION_KM of a town, and how far it is. */
export function nearbyStation(
  place: Place,
  list: Place[],
): { station: Place; km: number } | undefined {
  if (place.kind !== "town") return undefined;
  let best: { station: Place; km: number } | undefined;
  for (const station of list) {
    if (station.kind !== "station") continue;
    const km = distanceKm(place.coord, station.coord);
    if (km <= STATION_KM && (!best || km < best.km)) best = { station, km };
  }
  return best;
}

export function placeKey(place: Place): string {
  return `${place.kind}:${place.osmId ?? place.coord.join(",")}`;
}

/**
 * Places whose name matches the query. Names that start with it come
 * first, then names with a word that starts with it, then the rest.
 * Towns come before stations of the same rank.
 */
export function searchPlaces(list: Place[], query: string, limit = 8) {
  const q = normalize(query.trim());
  if (!q) return list.filter((p) => p.kind === "town").slice(0, limit);
  const ranked: { place: Place; rank: number }[] = [];
  for (const place of list) {
    const name = normalize(place.name);
    const at = name.indexOf(q);
    if (at < 0) continue;
    const wordStart = at === 0 || /[\s\-(]/.test(name[at - 1] ?? "");
    const rank = (at === 0 ? 0 : wordStart ? 1 : 2) * 2;
    ranked.push({ place, rank: rank + (place.kind === "station" ? 1 : 0) });
  }
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.place.name.length - b.place.name.length ||
        a.place.name.localeCompare(b.place.name),
    )
    .slice(0, limit)
    .map((r) => r.place);
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
