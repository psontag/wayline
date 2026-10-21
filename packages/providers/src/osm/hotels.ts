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
export const HOTEL_KM = 2;

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

/** Hotels that fit the budget first, each group nearest first. */
export function byBudget<T extends Pick<GeoHotel, "kind" | "stars">>(
  hotels: T[],
  budget?: HotelBudget,
): T[] {
  return [
    ...hotels.filter((h) => fitsBudget(h, budget)),
    ...hotels.filter((h) => !fitsBudget(h, budget)),
  ];
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
