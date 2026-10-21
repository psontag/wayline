import { distanceKm, type HotelBudget, type LonLat } from "@wayline/domain";
import type {
  HotelOption,
  LodgingProvider,
  RouteNetworkSource,
} from "../types";
import { byBudget, HOTEL_KM, HotelIndex } from "./hotels";

/** OSM hotels from places.json of the region data. */
export class OsmLodging implements LodgingProvider {
  private index?: Promise<HotelIndex>;

  constructor(private source: RouteNetworkSource) {}

  async hotelsNear(
    coord: LonLat,
    {
      radiusKm = HOTEL_KM,
      limit = 10,
      budget,
    }: { radiusKm?: number; limit?: number; budget?: HotelBudget } = {},
  ): Promise<HotelOption[]> {
    this.index ??= this.source.places().then((p) => new HotelIndex(p.hotels));
    const near = (await this.index).near(coord, radiusKm);
    return byBudget(near, budget)
      .slice(0, limit)
      .map((h) => {
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
      });
  }
}
