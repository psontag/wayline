import {
  type GeoHotel,
  type GeoStation,
  type GeoTown,
  type Hotel,
  type HotelBudget,
  type LonLat,
  type Place,
  type Places,
} from "@wayline/domain";
import {
  byBudget,
  fitsBudget,
  HOTEL_KM,
  HotelIndex,
  toHotel,
} from "@wayline/providers";
import type { Graph } from "../graph/Graph";

/**
 * Names, places and hotels for network nodes. Built once per network.
 */
export class Stops {
  private towns = new Map<number, GeoTown>();
  private stations = new Map<number, GeoStation>();
  private hotels: HotelIndex;

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
    this.hotels = new HotelIndex(places.hotels);
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

  /**
   * Nodes that can be stops: towns with at least one hotel we can show. The
   * node count also has hotels without a name, which places.json leaves out.
   */
  hotelNodes(): number[] {
    return this.graph.nodes
      .filter(
        (n) =>
          n.hotelCount > 0 && this.hotelsNear(this.town(n.id).coord).length > 0,
      )
      .map((n) => n.id);
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
    return this.hotels.near(coord, radiusKm);
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
    const [h] = byBudget(this.hotelsNear(coord), budget);
    return h && toHotel(h);
  }
}
