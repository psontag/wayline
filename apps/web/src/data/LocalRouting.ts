import {
  encodeLine,
  type Leg,
  type LonLat,
  type Manifest,
} from "@wayline/domain";
import type { RouteOptions, RoutingProvider } from "@wayline/providers";
import { COST_PROFILES, type FetchFile, Router } from "@wayline/router";

/** Bump when the router or its costs change, so cached legs are routed again. */
const ROUTER_VERSION = 1;

/**
 * Routes in the browser on the routing tiles of the dataset. Scenic and quiet
 * use the touring costs for now.
 */
export class LocalRouting implements RoutingProvider {
  private tiles: Promise<{ manifest: Manifest; fetchFile: FetchFile }>;

  constructor(dataUrl: Promise<string>, fetchFn: typeof fetch = fetch) {
    this.tiles = dataUrl.then(async (base) => {
      const res = await fetchFn(`${base}/manifest.json`);
      if (!res.ok) throw new Error(`${base}/manifest.json: ${res.status}`);
      const manifest = (await res.json()) as Manifest;
      const fetchFile: FetchFile = async (path) => {
        const file = await fetchFn(`${base}/${path}`);
        return file.ok ? new Uint8Array(await file.arrayBuffer()) : undefined;
      };
      return { manifest, fetchFile };
    });
  }

  async route(points: LonLat[], options: RouteOptions): Promise<Leg[]> {
    const { manifest, fetchFile } = await this.tiles;
    if (!manifest.routing) throw new Error("The dataset has no routing tiles");
    // One router per call: legs of a trip share tiles, and memory is free again after.
    const router = new Router(
      manifest.routing,
      fetchFile,
      COST_PROFILES[options.profile],
    );
    const legs: Leg[] = [];
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1] as LonLat;
      const to = points[i] as LonLat;
      const leg = await router.route(from, to, { signal: options.signal });
      if (options.signal?.aborted) throw new Error("Aborted");
      if (!leg) throw new Error(`No route from ${from} to ${to}`);
      legs.push({
        from,
        to,
        geometry: encodeLine(leg.points),
        elevation: leg.elevation,
        distance: leg.distance,
        ascent: leg.ascent,
        descent: leg.descent,
        surface: leg.surface,
        provider: "local",
        profileHash: `${options.profile}-${ROUTER_VERSION}`,
      });
    }
    return legs;
  }
}
