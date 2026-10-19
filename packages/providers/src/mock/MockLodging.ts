import { distanceKm, type GeoHotel, type LonLat } from "@wayline/domain";
import Flatbush from "flatbush";
import type { HotelOption, LodgingProvider, RouteNetworkSource } from "../types";

// Index coordinates in rough km, so nearest-neighbor search works on degrees.
const KM_PER_LAT = 110.57;
const KM_PER_LON = 111.32 * Math.cos((50 * Math.PI) / 180);

/** Hotels from places.json. */
export class MockLodging implements LodgingProvider {
  private index?: Promise<{ tree: Flatbush | null; hotels: GeoHotel[] }>;

  constructor(private source: RouteNetworkSource) {}

  async hotelsNear(
    coord: LonLat,
    { radiusKm = 3, limit = 10 }: { radiusKm?: number; limit?: number } = {},
  ): Promise<HotelOption[]> {
    const { tree, hotels } = await this.load();
    if (!tree) return [];
    const ids = tree.neighbors(
      coord[0] * KM_PER_LON,
      coord[1] * KM_PER_LAT,
      limit,
      radiusKm * 1.1,
    );
    return ids
      .map((i) => {
        const h = hotels[i]!;
        const hotelCoord: LonLat = [h.lon, h.lat];
        return {
          osmId: h.id,
          name: h.name,
          kind: h.kind,
          coord: hotelCoord,
          stars: h.stars,
          website: h.website,
          distanceKm: distanceKm(coord, hotelCoord),
        };
      })
      .filter((h) => h.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  private load() {
    this.index ??= this.source.places().then(({ hotels }) => {
      if (!hotels.length) return { tree: null, hotels };
      const tree = new Flatbush(hotels.length);
      for (const h of hotels) {
        const x = h.lon * KM_PER_LON;
        const y = h.lat * KM_PER_LAT;
        tree.add(x, y, x, y);
      }
      tree.finish();
      return { tree, hotels };
    });
    return this.index;
  }
}
