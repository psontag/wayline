import {
  distanceKm,
  type GeoHotel,
  type Hotel,
  type HotelBudget,
  type LonLat,
} from "@wayline/domain";
import Flatbush from "flatbush";

// Index coordinates in rough km, so nearest-neighbor search works on degrees.
const KM_PER_LAT = 110.57;
const KM_PER_LON = 111.32 * Math.cos((50 * Math.PI) / 180);

/** A hotel belongs to a stop within this distance. */
export const HOTEL_KM = 5;

/** Riding km per straight km, for a detour without routing. */
const DETOUR_FACTOR = 1.3;

/**
 * Rough riding km from the nearest route point to a place. Without a route,
 * from the stop itself.
 */
export function detourKm(at: LonLat, route: LonLat[]): number {
  let best = Infinity;
  for (const p of route) best = Math.min(best, distanceKm(at, p));
  return best === Infinity ? 0 : best * DETOUR_FACTOR;
}

/** Does a hotel fit the budget? OSM has no prices, so kind and stars stand in. */
export function fitsBudget(
  hotel: Pick<GeoHotel, "kind" | "stars">,
  budget?: HotelBudget,
): boolean {
  const stars = hotel.stars;
  switch (budget) {
    case "low":
      return hotel.kind !== "hotel" || (stars !== undefined && stars <= 2);
    case "mid":
      return stars === undefined || stars <= 3;
    case "high":
      return hotel.kind === "hotel" && (stars === undefined || stars >= 3);
    default:
      return true;
  }
}

/** Snapshot of an OSM hotel for a trip. */
export function toHotel(h: GeoHotel): Hotel {
  const hotel: Hotel = { osmId: h.id, name: h.name, coord: [h.lon, h.lat] };
  if (h.stars !== undefined) hotel.stars = h.stars;
  if (h.website !== undefined) hotel.website = h.website;
  return hotel;
}

/**
 * Hotels that fit the budget first, each group by detour. Without a
 * detour, the order stays.
 */
export function byBudget<
  T extends Pick<GeoHotel, "kind" | "stars"> & { detourKm?: number },
>(hotels: T[], budget?: HotelBudget): T[] {
  const fits = (h: T) => (fitsBudget(h, budget) ? 0 : 1);
  return [...hotels].sort(
    (a, b) => fits(a) - fits(b) || (a.detourKm ?? 0) - (b.detourKm ?? 0),
  );
}

/** Spatial index over the hotels of places.json. */
export class HotelIndex {
  private tree: Flatbush | null = null;

  constructor(private hotels: GeoHotel[]) {
    if (!hotels.length) return;
    this.tree = new Flatbush(hotels.length);
    for (const h of hotels) {
      const x = h.lon * KM_PER_LON;
      const y = h.lat * KM_PER_LAT;
      this.tree.add(x, y, x, y);
    }
    this.tree.finish();
  }

  /** Hotels within radiusKm, nearest first. */
  near(coord: LonLat, radiusKm = HOTEL_KM, limit = Infinity): GeoHotel[] {
    if (!this.tree) return [];
    return this.tree
      .neighbors(
        coord[0] * KM_PER_LON,
        coord[1] * KM_PER_LAT,
        limit,
        radiusKm * 1.1,
      )
      .flatMap((i) => this.hotels[i] ?? [])
      .filter((h) => distanceKm(coord, [h.lon, h.lat]) <= radiusKm);
  }
}
