import type {
  BBox,
  Connection,
  Daylight,
  Hotel,
  HotelBudget,
  Leg,
  LonLat,
  Manifest,
  Places,
  RouteInfo,
  SearchIndex,
  Profile,
  RouteNetwork,
  TrainQuery,
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
  /** Rough riding km from the nearest route point. */
  detourKm: number;
};

export interface LodgingProvider {
  /**
   * Hotels near a point, by default within the stop radius. Those that fit
   * the budget come first, each group by detour from the route. Without a
   * route, the detour is from the point.
   */
  hotelsNear(
    coord: LonLat,
    options?: {
      radiusKm?: number;
      limit?: number;
      budget?: HotelBudget;
      route?: LonLat[];
    },
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
  /**
   * Towns, stations and hotels around bbox, like network(). Towns and
   * stations come with the tile of their node. Without bbox, the whole
   * region. Pass a bbox for tiled data.
   */
  places(bbox?: BBox): Promise<Places>;
  /** Signed routes of the whole region. Sources without a table leave it out. */
  routes?(): Promise<RouteInfo[]>;
  /** Towns and stations on the network of the whole region, for place search. */
  search(): Promise<SearchIndex>;
}

/** Loads JSON from a URL. The app passes a fetch wrapper. */
export type FetchJson = (url: string) => Promise<unknown>;

/** Loads the bytes of a URL. Fails if it is missing. */
export type FetchBytes = (url: string) => Promise<Uint8Array>;

/** A connection from a search, not saved yet. */
export type TrainOption = Omit<Connection, "direction">;

export interface TrainProvider {
  /** A few connections around the query time, earliest first. */
  connections(
    query: TrainQuery & { time: string },
    options?: { signal?: AbortSignalLike },
  ): Promise<TrainOption[]>;
}

/** The part of fetch we use. Works without DOM or Worker types. */
export type HttpFetch = (
  url: string,
  init?: { signal?: AbortSignalLike },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
