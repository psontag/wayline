import type {
  Hotel,
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
};

export interface WeatherProvider {
  forecast(coord: LonLat, options?: { signal?: AbortSignalLike }): Promise<Forecast>;
}

export type HotelOption = Hotel & {
  kind: "hotel" | "guest_house" | "motel";
  /** Straight-line distance from the search point. */
  distanceKm: number;
};

export interface LodgingProvider {
  /** Hotels near a point, nearest first. */
  hotelsNear(
    coord: LonLat,
    options?: { radiusKm?: number; limit?: number },
  ): Promise<HotelOption[]>;
}

/** Static geodata of one region. Each file loads once. */
export interface RouteNetworkSource {
  manifest(): Promise<Manifest>;
  network(): Promise<RouteNetwork>;
  places(): Promise<Places>;
}

/** Loads JSON from a URL. The app passes a fetch wrapper. */
export type FetchJson = (url: string) => Promise<unknown>;
