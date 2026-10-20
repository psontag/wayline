import {
  ApiErrorBody,
  type Leg,
  type LonLat,
  type Profile,
  ProviderEnvelope,
  WaylineError,
} from "@wayline/domain";
import {
  parseBrouterLeg,
  type RouteOptions,
  type RoutingProvider,
} from "@wayline/providers";
import { type ApiClient, createApiClient } from "./apiClient";

/** The browser sends at most this many routing requests at once. */
const MAX_PARALLEL = 3;

/**
 * Routes each leg through POST /api/route. The Worker caches legs and
 * returns the raw router answer, which is parsed here.
 */
export class ApiRouting implements RoutingProvider {
  constructor(private client: ApiClient = createApiClient()) {}

  async route(points: LonLat[], options: RouteOptions): Promise<Leg[]> {
    const pairs = points.slice(1).map((to, i) => [points[i], to] as const);
    const signal =
      options.signal instanceof AbortSignal ? options.signal : undefined;
    const legs: Leg[] = new Array(pairs.length);
    let next = 0;
    const worker = async () => {
      while (next < pairs.length) {
        const i = next++;
        const [from, to] = pairs[i] as readonly [LonLat, LonLat];
        if (options.signal?.aborted) throw new Error("Aborted");
        legs[i] = await this.leg(from, to, options.profile, signal);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, pairs.length) }, worker),
    );
    return legs;
  }

  private async leg(
    from: LonLat,
    to: LonLat,
    profile: Profile,
    signal?: AbortSignal,
  ): Promise<Leg> {
    const res = await this.client.api.route.$post(
      { json: { from, to, profile } },
      { init: { signal } },
    );
    const body: unknown = await res.json();
    if (!res.ok) {
      const error = ApiErrorBody.safeParse(body);
      if (error.success) {
        const { code, message, retryAfter } = error.data;
        throw new WaylineError(code, message, retryAfter);
      }
      throw new WaylineError("PROVIDER_UNAVAILABLE", `API: ${res.status}`);
    }
    // BRouter and the fake router both answer in BRouter's GeoJSON.
    return parseBrouterLeg(ProviderEnvelope.parse(body), from, to);
  }
}
