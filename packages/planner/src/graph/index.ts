import type { RouteNetworkSource } from "@wayline/providers";
import { Graph } from "./Graph";

export * from "./area";
export * from "./dijkstra";
export * from "./Graph";
export * from "./leg";

/** Loads the network of a source and builds the graph. */
export async function loadGraph(source: RouteNetworkSource): Promise<Graph> {
  return new Graph(await source.network());
}
