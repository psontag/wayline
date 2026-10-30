import type {
  BBox,
  Daylight,
  Hotel,
  HotelBudget,
  Leg,
  LonLat,
  Manifest,
  Places,
  Profile,
  RouteNetwork,
  WeatherSample,
} from "@wayline/domain";

/** The part of AbortSignal we use. Works without DOM types. */
export type AbortSignalLike = { readonly aborted: boolean };

export type RouteOptions = {
  profile: Profile;
  signal?: AbortSignalLike;
};

export interface RoutingProvider {
  /** Routes through all points. Returns one leg per consecutive pair. */
  route(points: LonLat[], options: RouteOptions): Promise<Leg[]>;
}

export type Forecast = {
  /** Center of the 0.1° cell the forecast is for. */
  cell: LonLat;
  /** Hourly, from today 00:00 to the end of the forecast range. */
  samples: WeatherSample[];
  /** Sunrise and sunset per day of the range. */
  daylight: Daylight[];
};

export interface WeatherProvider {
  forecast(
    coord: LonLat,
    options?: { signal?: AbortSignalLike },
  ): Promise<Forecast>;
}

export type HotelOption = Hotel & {
  kind: "hotel" | "guest_house" | "motel";
  /** Straight-line distance from the search point. */
  distanceKm: number;
};

export interface LodgingProvider {
  /**
   * Hotels near a point, by default within the stop radius. Those that fit
   * the budget come first, each group nearest first.
   */
  hotelsNear(
    coord: LonLat,
    options?: { radiusKm?: number; limit?: number; budget?: HotelBudget },
  ): Promise<HotelOption[]>;
}

/** Static geodata of one region. Each file loads once. */
export interface RouteNetworkSource {
  manifest(): Promise<Manifest>;
  /**
   * The route network around bbox: at least every node in it and every edge
   * that touches one of those nodes, plus the far ends of those edges. It may
   * hold more. Without bbox, the whole region. Pass a bbox for tiled data.
   */
  network(bbox?: BBox): Promise<RouteNetwork>;
  /** Towns, stations and hotels of the whole region. */
  places(): Promise<Places>;
}

/** Loads JSON from a URL. The app passes a fetch wrapper. */
export type FetchJson = (url: string) => Promise<unknown>;
