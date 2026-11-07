import {
  encodeLine,
  type Leg,
  type LonLat,
  type Manifest,
  type Profile,
} from "@wayline/domain";
import type { RouteOptions, RoutingProvider } from "@wayline/providers";
import { COST_PROFILES, type FetchFile, Router } from "@wayline/router";

/** Saved with each leg. Bump when the router or its costs change. */
const ROUTER_VERSION = 2;

/**
 * A router and its tiles stay this long after the last route ends. The
 * proposals of a run share them, and memory is free again soon after.
 */
const KEEP_MS = 30_000;

type Kept = {
  router: Router;
  users: number;
  timer?: ReturnType<typeof setTimeout>;
};

/** Routes in the browser on the routing tiles of the dataset. */
export class LocalRouting implements RoutingProvider {
  private tiles: Promise<{ manifest: Manifest; fetchFile: FetchFile }>;
  private routers = new Map<Profile, Kept>();

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

  /** Runs work with the shared router of a profile. */
  private async withRouter<T>(
    profile: Profile,
    work: (router: Router) => Promise<T>,
  ): Promise<T> {
    const { manifest, fetchFile } = await this.tiles;
    if (!manifest.routing) throw new Error("The dataset has no routing tiles");
    let kept = this.routers.get(profile);
    if (!kept) {
      const router = new Router(
        manifest.routing,
        fetchFile,
        COST_PROFILES[profile],
      );
      kept = { router, users: 0 };
      this.routers.set(profile, kept);
    }
    clearTimeout(kept.timer);
    kept.users++;
    try {
      return await work(kept.router);
    } finally {
      const k = kept;
      if (--k.users === 0)
        k.timer = setTimeout(() => {
          if (this.routers.get(profile) === k) this.routers.delete(profile);
        }, KEEP_MS);
    }
  }

  route(points: LonLat[], options: RouteOptions): Promise<Leg[]> {
    return this.withRouter(options.profile, async (router) => {
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
    });
  }
}
