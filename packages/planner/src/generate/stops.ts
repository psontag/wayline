import {
  distanceKm,
  type GeoHotel,
  type GeoStation,
  type GeoTown,
  type Hotel,
  type HotelBudget,
  type LonLat,
  type Place,
  type Places,
} from "@wayline/domain";
import Flatbush from "flatbush";
import type { Graph } from "../graph/Graph";

// Index coordinates in rough km, so nearest-neighbor search works on degrees.
const KM_PER_LAT = 110.57;
const KM_PER_LON = 111.32 * Math.cos((50 * Math.PI) / 180);

/** A hotel counts for a stop within this distance. */
export const HOTEL_KM = 2;

/** Does a hotel fit the budget? OSM has no prices, so kind and stars stand in. */
export function fitsBudget(hotel: GeoHotel, budget?: HotelBudget): boolean {
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

/**
 * Names, places and hotels for network nodes. Built once per network.
 */
export class Stops {
  private towns = new Map<number, GeoTown>();
  private stations = new Map<number, GeoStation>();
  private hotels: GeoHotel[];
  private index: Flatbush | null = null;

  constructor(
    private graph: Graph,
    places: Places,
  ) {
    for (const t of places.towns) {
      if (t.nodeId === null) continue;
      const cur = this.towns.get(t.nodeId);
      if (!cur || t.hotelCount > cur.hotelCount) this.towns.set(t.nodeId, t);
    }
    for (const s of places.stations) {
      if (s.nodeId !== null && !this.stations.has(s.nodeId)) {
        this.stations.set(s.nodeId, s);
      }
    }
    this.hotels = places.hotels;
    if (this.hotels.length) {
      this.index = new Flatbush(this.hotels.length);
      for (const h of this.hotels) {
        const x = h.lon * KM_PER_LON;
        const y = h.lat * KM_PER_LAT;
        this.index.add(x, y, x, y);
      }
      this.index.finish();
    }
  }

  /** Station node ids. */
  stationNodes(): number[] {
    return this.graph.nodes
      .filter((n) => n.kind === "station")
      .map((n) => n.id);
  }

  /** Town node ids. */
  townNodes(): number[] {
    return this.graph.nodes.filter((n) => n.kind === "town").map((n) => n.id);
  }

  /** Nodes that can be stops: towns with at least one hotel. */
  hotelNodes(): number[] {
    return this.graph.nodes.filter((n) => n.hotelCount > 0).map((n) => n.id);
  }

  /** Station at a node as a place. */
  station(node: number): Place {
    const s = this.stations.get(node);
    const n = this.graph.node(node);
    return s
      ? { name: s.name, kind: "station", coord: [s.lon, s.lat], osmId: s.id }
      : { name: n.name ?? "", kind: "station", coord: [n.lon, n.lat] };
  }

  /** Town at a node as a place. Falls back to the station or the node. */
  town(node: number): Place {
    const t = this.towns.get(node);
    if (t) {
      return { name: t.name, kind: "town", coord: [t.lon, t.lat], osmId: t.id };
    }
    if (this.stations.has(node)) return this.station(node);
    const n = this.graph.node(node);
    return { name: n.name ?? "", kind: "town", coord: [n.lon, n.lat] };
  }

  /** OSM town data at a node, if a town snaps to it. */
  geoTown(node: number): GeoTown | undefined {
    return this.towns.get(node);
  }

  /** Hotels near a point, nearest first. */
  hotelsNear(coord: LonLat, radiusKm = HOTEL_KM): GeoHotel[] {
    if (!this.index) return [];
    return this.index
      .neighbors(
        coord[0] * KM_PER_LON,
        coord[1] * KM_PER_LAT,
        Infinity,
        radiusKm * 1.1,
      )
      .flatMap((i) => this.hotels[i] ?? [])
      .filter((h) => distanceKm(coord, [h.lon, h.lat]) <= radiusKm);
  }

  /** Hotels at a stop node that fit the budget. */
  hotelCount(node: number, budget?: HotelBudget): number {
    const all = this.graph.node(node).hotelCount;
    if (!budget) return all;
    return this.hotelsNear(this.town(node).coord).filter((h) =>
      fitsBudget(h, budget),
    ).length;
  }

  /** Nearest hotel that fits the budget, else the nearest one. */
  pickHotel(coord: LonLat, budget?: HotelBudget): Hotel | undefined {
    const near = this.hotelsNear(coord);
    const h = near.find((x) => fitsBudget(x, budget)) ?? near[0];
    if (!h) return undefined;
    const hotel: Hotel = { osmId: h.id, name: h.name, coord: [h.lon, h.lat] };
    if (h.stars !== undefined) hotel.stars = h.stars;
    if (h.website !== undefined) hotel.website = h.website;
    return hotel;
  }
}
