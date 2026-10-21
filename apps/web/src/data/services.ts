import { AreaCache, bboxAround, FakeRouting, Graph } from "@wayline/planner";
import type { LonLat } from "@wayline/domain";
import {
  FakeWeather,
  type LodgingProvider,
  OpenMeteoWeather,
  OsmLodging,
  openSource,
  type RouteNetworkSource,
  type RoutingProvider,
  type WeatherProvider,
} from "@wayline/providers";
import { ApiRouting } from "./ApiRouting";
import { ApiTripStore, fetchMe, withMovedTrips } from "./ApiTripStore";
import { indexedDbForecastCache } from "./forecastCache";
import { createTripGenerator } from "./generator";
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
  lodging: LodgingProvider;
  network: RouteNetworkSource;
  /** Nearest node of the route network, or the point itself if none is close. */
  snap: (coord: LonLat) => Promise<LonLat>;
};

/** A dragged via point moves to a network node this close. */
const SNAP_KM = 0.5;

const MOCK_DATA = "/data/mock/oberfranken";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/**
 * The region data named by /data/latest.json, if it is there.
 * Else, or with VITE_DATA=mock, the Oberfranken mock.
 */
async function dataUrl(): Promise<string> {
  if (import.meta.env.VITE_DATA === "mock") return MOCK_DATA;
  try {
    const latest = (await fetchJson("/data/latest.json")) as {
      version?: unknown;
    };
    if (typeof latest.version === "string") return `/data/${latest.version}`;
  } catch {
    // Not built. The dev server answers with index.html, which is no JSON.
  }
  return MOCK_DATA;
}

export function createServices(): Services {
  const url = dataUrl();
  const source = url.then((u) => openSource(fetchJson, u));
  const network: RouteNetworkSource = {
    manifest: async () => (await source).manifest(),
    network: async (bbox) => (await source).network(bbox),
    places: async () => (await source).places(),
  };
  const graphs = new AreaCache(network, (n) => new Graph(n));
  // VITE_ROUTING=api routes through the Worker. Default: the route network.
  const routing =
    import.meta.env.VITE_ROUTING === "api"
      ? new ApiRouting()
      : new FakeRouting((bbox) => graphs.get(bbox));
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
    lodging: new OsmLodging(network),
    network,
    async snap(coord) {
      const graph = await graphs.get(bboxAround([coord], 2));
      const node = graph.nearestNode(coord, { maxKm: SNAP_KM });
      return node === undefined ? coord : graph.coord(node);
    },
  };
}

/** VITE_WEATHER=open-meteo asks Open-Meteo. Default: made-up weather. */
function createWeather(): WeatherProvider {
  if (import.meta.env.VITE_WEATHER !== "open-meteo") return new FakeWeather();
  return new OpenMeteoWeather({
    fetch: (url) => fetch(url),
    cache: indexedDbForecastCache(),
  });
}
