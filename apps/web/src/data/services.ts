import { AreaCache, bboxAround, FakeRouting, Graph } from "@wayline/planner";
import {
  type BBox,
  type LonLat,
  type ReachFile,
  type RouteInfo,
  type RouteTable,
  SiteInfo,
  WaylineError,
} from "@wayline/domain";
import {
  DbRestTrains,
  FakeTrains,
  FakeWeather,
  type LodgingProvider,
  OpenMeteoWeather,
  OsmLodging,
  openSource,
  type RouteNetworkSource,
  type RoutingProvider,
  type TrainProvider,
  TransitousTrains,
  type WeatherProvider,
} from "@wayline/providers";
import { offlineAware } from "./apiClient";
import { sameStation } from "./homeStation";
import { dataUrl, MOCK_DATA } from "./dataUrl";
import { ApiTripStore, fetchMe, withMovedTrips } from "./ApiTripStore";
import { indexedDbForecastCache } from "./forecastCache";
import { createTripGenerator } from "./generator";
import { LocalRouting } from "./LocalRouting";
import { LocalTripStore } from "./LocalTripStore";
import type { TripGenerator } from "./TripGenerator";
import type { TripStore } from "./TripStore";

/** Everything screens need from outside. Real APIs replace only this file. */
export type Services = {
  /** Email of the logged-in user. Null without a server: all trips are mine. */
  me: () => Promise<string | null>;
  trips: TripStore;
  generator: TripGenerator;
  routing: RoutingProvider;
  weather: WeatherProvider;
  trains: TrainProvider;
  lodging: LodgingProvider;
  network: RouteNetworkSource;
  /** Nearest point on a way (with local routing) or network node, or the point itself if none is close. */
  snap: (coord: LonLat) => Promise<LonLat>;
  /** The route network around a bbox. */
  graph: (bbox: BBox) => Promise<Graph>;
  /** Vector tiles of the signed routes. Null if the data has none. */
  lines: () => Promise<RouteLines | null>;
  /** Train times from a home station. Null if the data has none for it. */
  reach: (home: string) => Promise<ReachFile | null>;
  /** Whether a hotel website works, and its image. Null without a server. */
  site: (url: string) => Promise<SiteInfo | null>;
};

export type RouteLines = {
  /** Tile URL with "{z}", "{x}" and "{y}". */
  tiles: string;
  minzoom: number;
  maxzoom: number;
  /** Area with tiles. The map asks for none outside it. */
  bounds: BBox;
  /** Routes by id. */
  routes: Map<number, RouteInfo>;
};

/** A dragged via point moves to a way or network node this close. */
const SNAP_KM = 0.5;

const fetchOnline = offlineAware(globalThis.fetch);

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchOnline(url);
  if (!res.ok)
    throw new WaylineError("PROVIDER_UNAVAILABLE", `${url}: ${res.status}`);
  return res.json();
}

export function createServices(): Services {
  const url = dataUrl();
  const source = url.then((u) => openSource(fetchJson, u));
  const network: RouteNetworkSource = {
    manifest: async () => (await source).manifest(),
    network: async (bbox) => (await source).network(bbox),
    places: async (bbox) => (await source).places(bbox),
    search: async () => (await source).search(),
  };
  const graphs = new AreaCache(network, (n) => new Graph(n));
  // VITE_ROUTING=local routes on the routing tiles. Default: the route network.
  const local =
    import.meta.env.VITE_ROUTING === "local" ? new LocalRouting(url) : null;
  const routing = local ?? new FakeRouting((bbox) => graphs.get(bbox));
  // VITE_TRIPS=api saves trips on the server. Default: browser storage.
  const onServer = import.meta.env.VITE_TRIPS === "api";
  const trips = onServer
    ? withMovedTrips(new ApiTripStore(), new LocalTripStore())
    : new LocalTripStore({
        loadSample: () => fetchJson(`${MOCK_DATA}/sample-trip.json`),
      });
  return {
    me: async () => (onServer ? fetchMe() : null),
    trips,
    generator: createTripGenerator({ dataUrl: url }),
    routing,
    weather: createWeather(),
    trains: createTrains(),
    lodging: new OsmLodging(network),
    network,
    async snap(coord) {
      if (local) return (await local.snap(coord, SNAP_KM)) ?? coord;
      const graph = await graphs.get(bboxAround([coord], 2));
      const node = graph.nearestNode(coord, { maxKm: SNAP_KM });
      return node === undefined ? coord : graph.coord(node);
    },
    graph: (bbox) => graphs.get(bbox),
    async lines() {
      const base = await url;
      const { lines, files } = await network.manifest();
      if (!lines || !files.routes) return null;
      const table = (await fetchJson(`${base}/${files.routes}`)) as RouteTable;
      return {
        // Not new URL(): it would encode the braces.
        tiles: `${location.origin}${base}/${lines.path}`,
        minzoom: lines.minzoom,
        maxzoom: lines.maxzoom,
        bounds: lines.bounds,
        routes: new Map(table.routes.map((r) => [r.id, r])),
      };
    },
    async reach(home) {
      const base = await url;
      const { files } = await network.manifest();
      const entry = files.reach?.find((r) => sameStation(r.name, home));
      if (!entry) return null;
      return (await fetchJson(`${base}/${entry.path}`)) as ReachFile;
    },
    site: async (siteUrl) =>
      onServer
        ? SiteInfo.parse(
            await fetchJson(`/api/site?url=${encodeURIComponent(siteUrl)}`),
          )
        : null,
  };
}

/**
 * VITE_TRAINS=transitous asks Transitous, VITE_TRAINS=db-rest asks
 * db.transport.rest. Default: made-up trains.
 */
function createTrains(): TrainProvider {
  const fetchText = (url: string) => fetch(url);
  switch (import.meta.env.VITE_TRAINS) {
    case "transitous":
      return new TransitousTrains({ fetch: fetchText });
    case "db-rest":
      return new DbRestTrains({ fetch: fetchText });
    default:
      return new FakeTrains();
  }
}

/** VITE_WEATHER=open-meteo asks Open-Meteo. Default: made-up weather. */
function createWeather(): WeatherProvider {
  if (import.meta.env.VITE_WEATHER !== "open-meteo") return new FakeWeather();
  return new OpenMeteoWeather({
    fetch: (url) => fetch(url),
    cache: indexedDbForecastCache(),
  });
}
