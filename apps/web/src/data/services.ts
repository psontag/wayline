import { AreaCache, FakeRouting, Graph } from "@wayline/planner";
import {
  FakeWeather,
  type LodgingProvider,
  MockLodging,
  openSource,
  type RouteNetworkSource,
  type RoutingProvider,
  type WeatherProvider,
} from "@wayline/providers";
import { ApiRouting } from "./ApiRouting";
import { createTripGenerator } from "./generator";
import { LocalTripStore } from "./LocalTripStore";
import type { TripGenerator } from "./TripGenerator";
import type { TripStore } from "./TripStore";

/** Everything screens need from outside. Real APIs replace only this file. */
export type Services = {
  trips: TripStore;
  generator: TripGenerator;
  routing: RoutingProvider;
  weather: WeatherProvider;
  lodging: LodgingProvider;
  network: RouteNetworkSource;
};

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
  return {
    trips: new LocalTripStore({
      loadSample: () => fetchJson(`${MOCK_DATA}/sample-trip.json`),
    }),
    generator: createTripGenerator({ dataUrl: url }),
    routing,
    weather: new FakeWeather(),
    lodging: new MockLodging(network),
    network,
  };
}
