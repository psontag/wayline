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
import {
  byBudget,
  detourKm,
  fitsBudget,
  HOTEL_KM,
  HotelIndex,
  toHotel,
} from "@wayline/providers";
import type { Graph } from "../graph/Graph";

/** Hotels within this distance count as in the town. */
const TOWN_HOTEL_KM = 2;
/** Built-up radius around each kind of place. */
const URBAN_KM: Partial<Record<GeoTown["place"], number>> = {
  city: 4,
  town: 1.5,
};
const PLACE_RANK: Record<GeoTown["place"], number> = {
  village: 0,
  town: 1,
  city: 2,
};
/** Grid cell in degrees for finding towns near a stop. */
const CELL = 0.05;
const cellKey = (lon: number, lat: number) =>
  `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`;

/**
 * Names, places and hotels for network nodes. Built once per network.
 */
export class Stops {
  private towns = new Map<number, GeoTown>();
  /** Towns and cities by grid cell, snapped or not. */
  private bigTowns = new Map<string, GeoTown[]>();
  private stations = new Map<number, GeoStation>();
  private hotels: HotelIndex;
  private urban?: Set<number>;

  constructor(
    private graph: Graph,
    places: Places,
  ) {
    for (const t of places.towns) {
      if (t.place !== "village") {
        const key = cellKey(t.lon, t.lat);
        this.bigTowns.set(key, [...(this.bigTowns.get(key) ?? []), t]);
      }
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

  /** Nodes in built-up areas: near a city or town. Villages don't count. */
  urbanNodes(): Set<number> {
    if (this.urban) return this.urban;
    this.urban = new Set();
    for (const [node, t] of this.towns) {
      const km = URBAN_KM[t.place];
      if (!km) continue;
      for (const n of this.graph.nodesWithin(this.graph.coord(node), km)) {
        this.urban.add(n);
      }
    }
    return this.urban;
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
      const named = this.biggerNear(t) ?? t;
      return {
        name: named.name,
        kind: "town",
        coord: [t.lon, t.lat],
        osmId: named.id,
      };
    }
    if (this.stations.has(node)) return this.station(node);
    const n = this.graph.node(node);
    return { name: n.name ?? "", kind: "town", coord: [n.lon, n.lat] };
  }

  /**
   * The biggest place that outranks t and has most of the hotels near it. A
   * stop at a village next to a town is named after the town.
   */
  private biggerNear(t: GeoTown): GeoTown | undefined {
    const at: LonLat = [t.lon, t.lat];
    const bigger = (a: GeoTown, b: GeoTown) =>
      PLACE_RANK[a.place] - PLACE_RANK[b.place] ||
      (a.population ?? 0) - (b.population ?? 0);
    let best: GeoTown | undefined;
    for (const dx of [-CELL, 0, CELL]) {
      for (const dy of [-CELL, 0, CELL]) {
        const cell = this.bigTowns.get(cellKey(t.lon + dx, t.lat + dy)) ?? [];
        for (const o of cell) {
          if (PLACE_RANK[o.place] <= PLACE_RANK[t.place]) continue;
          if (distanceKm(at, [o.lon, o.lat]) > TOWN_HOTEL_KM) continue;
          if (!best || bigger(o, best) > 0) best = o;
        }
      }
    }
    if (!best) return undefined;
    const town: LonLat = [best.lon, best.lat];
    const hotels = this.hotelsNear(at, TOWN_HOTEL_KM);
    const own = hotels.filter(
      (h) => distanceKm(at, [h.lon, h.lat]) < distanceKm(town, [h.lon, h.lat]),
    );
    return own.length * 2 < hotels.length ? best : undefined;
  }

  /** OSM town data at a node, if a town snaps to it. */
  geoTown(node: number): GeoTown | undefined {
    return this.towns.get(node);
  }

  /** Hotels near a point, nearest first. */
  hotelsNear(coord: LonLat, radiusKm = HOTEL_KM): GeoHotel[] {
    return this.hotels.near(coord, radiusKm);
  }

  /**
   * Hotels in the town at a stop node that fit the budget. Hotels further
   * away still show at the stop, but mean a detour.
   */
  hotelCount(node: number, budget?: HotelBudget): number {
    return this.hotelsNear(this.town(node).coord, TOWN_HOTEL_KM).filter((h) =>
      fitsBudget(h, budget),
    ).length;
  }

  /**
   * Hotel with the shortest detour from the route that fits the budget,
   * else the one with the shortest detour.
   */
  pickHotel(
    coord: LonLat,
    budget?: HotelBudget,
    route: LonLat[] = [coord],
  ): Hotel | undefined {
    const near = this.hotelsNear(coord).map((h) => ({
      ...h,
      detourKm: detourKm([h.lon, h.lat], route),
    }));
    const [h] = byBudget(near, budget);
    return h && toHotel(h);
  }
}
