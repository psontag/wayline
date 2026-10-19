import { FakeRouting, loadGraph } from "@wayline/planner";
import {
  FakeWeather,
  type LodgingProvider,
  MockLodging,
  MockNetworkSource,
  type RouteNetworkSource,
  type RoutingProvider,
  type WeatherProvider,
} from "@wayline/providers";
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

export function createServices(): Services {
  const network = new MockNetworkSource(fetchJson, MOCK_DATA);
  let graph: ReturnType<typeof loadGraph> | undefined;
  const routing = new FakeRouting(() => (graph ??= loadGraph(network)));
  return {
    trips: new LocalTripStore({
      loadSample: () => fetchJson(`${MOCK_DATA}/sample-trip.json`),
    }),
    generator: createTripGenerator({ network, routing }),
    routing,
    weather: new FakeWeather(),
    lodging: new MockLodging(network),
    network,
  };
}
