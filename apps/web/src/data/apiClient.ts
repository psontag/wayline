import type { AppType } from "@wayline/api/app";
import { hc } from "hono/client";

/** Typed client for the Worker API. */
export function createApiClient(
  baseUrl = "/",
  fetch?: typeof globalThis.fetch,
) {
  return hc<AppType>(baseUrl, { fetch });
}

export type ApiClient = ReturnType<typeof createApiClient>;
