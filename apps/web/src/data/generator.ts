import type { RouteNetworkSource, RoutingProvider } from "@wayline/providers";
import type { TripGenerator } from "./TripGenerator";

export type GeneratorDeps = {
  network: RouteNetworkSource;
  routing: RoutingProvider;
};

/** Stub until the planner implements generation (#27). */
export function createTripGenerator(deps: GeneratorDeps): TripGenerator {
  void deps;
  return {
    generate: () =>
      Promise.reject(new Error("Trip generation is not implemented")),
  };
}
