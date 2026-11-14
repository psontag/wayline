import {
  distanceKm,
  type LonLat,
  type Place,
  type SearchEntry,
  type SearchIndex,
} from "@wayline/domain";

/** A trip starts or ends at a station this close to the chosen town. */
export const STATION_KM = 2;

const PLACE_RANK = { city: 0, town: 1, village: 2, station: 3 };

/** Search order within a match: cities, towns, main stations, villages, other stations. */
const IMPORTANCE = { city: 0, town: 1, main: 2, village: 3, station: 4 };
const importance = new WeakMap<Place, number>();

/**
 * Towns and stations of the search index. Towns first, bigger ones first,
 * so an empty search shows well-known towns.
 */
export function placeOptions(index: SearchIndex): Place[] {
  const rank = (e: SearchEntry) => PLACE_RANK[e.k];
  return [...index.places]
    .sort((a, b) => rank(a) - rank(b) || (b.h ?? 0) - (a.h ?? 0))
    .map((e): Place => {
      const place: Place = {
        name: e.n,
        kind: e.k === "station" ? "station" : "town",
        coord: [e.x, e.y],
        osmId: e.i,
      };
      if (e.k !== "station") importance.set(place, IMPORTANCE[e.k]);
      return place;
    });
}

const MAIN_STATION = /\b(hauptbahnhof|hbf)\b/;

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

/** A map click picks a place at most this far away. */
export const PICK_KM = 10;

/**
 * The place a click on the map means. The most important place within
 * nearKm, as the map labels it, else the nearest one within PICK_KM. The
 * list comes from placeOptions, most important first.
 */
export function nearestPlace(
  list: Place[],
  at: LonLat,
  nearKm = 0,
): Place | undefined {
  let best: { place: Place; km: number } | undefined;
  for (const place of list) {
    const km = distanceKm(place.coord, at);
    if (km <= nearKm) return place;
    if (km <= PICK_KM && (!best || km < best.km)) best = { place, km };
  }
  return best?.place;
}

export function placeKey(place: Place): string {
  return `${place.kind}:${place.osmId ?? place.coord.join(",")}`;
}

/**
 * Places whose name matches the query. Names that start with it come
 * first, then names with a word that starts with it, then the rest. Within
 * each: cities, towns, main stations, villages, other stations. A town with
 * the name of a bigger one is left out.
 */
export function searchPlaces(list: Place[], query: string, limit = 8) {
  const q = normalize(query.trim());
  if (!q) return list.filter((p) => p.kind === "town").slice(0, limit);
  const matches: { place: Place; name: string; rank: number }[] = [];
  const towns = new Set<string>();
  for (const place of list) {
    const name = normalize(place.name);
    const at = name.indexOf(q);
    if (at < 0) continue;
    const wordStart = at === 0 || /[\s\-(]/.test(name[at - 1] ?? "");
    matches.push({ place, name, rank: at === 0 ? 0 : wordStart ? 1 : 2 });
    if (place.kind === "town") towns.add(name);
  }
  const weight = ({ place, name }: { place: Place; name: string }) =>
    place.kind !== "station"
      ? (importance.get(place) ?? IMPORTANCE.town)
      : MAIN_STATION.test(name) || towns.has(name)
        ? IMPORTANCE.main
        : IMPORTANCE.station;
  const seen = new Set<string>();
  return matches
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        weight(a) - weight(b) ||
        a.place.name.length - b.place.name.length ||
        a.place.name.localeCompare(b.place.name),
    )
    .filter(({ place, name }) => {
      if (place.kind !== "town") return true;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, limit)
    .map((r) => r.place);
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
