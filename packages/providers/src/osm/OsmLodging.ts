import {
  bboxAround,
  distanceKm,
  type GeoHotel,
  type HotelBudget,
  type LonLat,
} from "@wayline/domain";
import type {
  HotelOption,
  LodgingProvider,
  RouteNetworkSource,
} from "../types";
import { byBudget, detourKm, HOTEL_KM, HotelIndex } from "./hotels";

/** OSM hotels from the place tiles of the region data. */
export class OsmLodging implements LodgingProvider {
  constructor(private source: RouteNetworkSource) {}

  async hotelsNear(
    coord: LonLat,
    {
      radiusKm = HOTEL_KM,
      limit = 10,
      budget,
      route = [coord],
    }: {
      radiusKm?: number;
      limit?: number;
      budget?: HotelBudget;
      route?: LonLat[];
    } = {},
  ): Promise<HotelOption[]> {
    const { hotels } = await this.source.places(bboxAround([coord], radiusKm));
    const near = new HotelIndex(hotels).near(coord, radiusKm);
    return byBudget(
      near.map((h) => toOption(h, coord, route)),
      budget,
    ).slice(0, limit);
  }
}

/** A hotel with its distance from a point and its detour from a route. */
export function toOption(
  h: GeoHotel,
  coord: LonLat,
  route: LonLat[],
): HotelOption {
  const hotelCoord: LonLat = [h.lon, h.lat];
  return {
    osmId: h.id,
    name: h.name,
    kind: h.kind,
    coord: hotelCoord,
    stars: h.stars,
    website: h.website,
    distanceKm: distanceKm(coord, hotelCoord),
    detourKm: detourKm(hotelCoord, route),
  };
}
