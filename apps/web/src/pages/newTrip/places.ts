import type { Place, Places } from "@wayline/domain";

/** Stations and towns on the route network, stations first. */
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
    .map((t): Place => ({
      name: t.name,
      kind: "town",
      coord: [t.lon, t.lat],
      osmId: t.id,
    }));
  return [...stations, ...towns];
}

export function placeKey(place: Place): string {
  return `${place.kind}:${place.osmId ?? place.coord.join(",")}`;
}

/**
 * Places whose name matches the query. Names that start with it come
 * first, then names with a word that starts with it, then the rest.
 */
export function searchPlaces(list: Place[], query: string, limit = 8) {
  const q = normalize(query.trim());
  if (!q) return list.filter((p) => p.kind === "station").slice(0, limit);
  const ranked: { place: Place; rank: number }[] = [];
  for (const place of list) {
    const name = normalize(place.name);
    const at = name.indexOf(q);
    if (at < 0) continue;
    const wordStart = at === 0 || /[\s\-(]/.test(name[at - 1] ?? "");
    const rank = (at === 0 ? 0 : wordStart ? 1 : 2) * 2;
    ranked.push({ place, rank: rank + (place.kind === "station" ? 0 : 1) });
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
