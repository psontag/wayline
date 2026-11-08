import type { AppType } from "@wayline/api/app";
import { ApiErrorBody, WaylineError } from "@wayline/domain";
import { hc } from "hono/client";

/** Typed client for the Worker API. */
export function createApiClient(
  baseUrl = "/",
  fetch: typeof globalThis.fetch = globalThis.fetch,
) {
  return hc<AppType>(baseUrl, { fetch: offlineAware(fetch) });
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** A fetch that throws WaylineError OFFLINE when there is no connection. */
export function offlineAware(
  fetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    try {
      return await fetch(input, init);
    } catch (error) {
      // fetch rejects with a TypeError when the network fails.
      if (error instanceof TypeError) {
        throw new WaylineError("OFFLINE", error.message);
      }
      throw error;
    }
  };
}

/** The JSON body of an answer. API errors become WaylineErrors. */
export async function readJson(res: Response): Promise<unknown> {
  if (res.ok) return res.status === 204 ? undefined : res.json();
  const error = ApiErrorBody.safeParse(await res.json().catch(() => null));
  if (error.success) {
    const { code, message, retryAfter } = error.data;
    throw new WaylineError(code, message, retryAfter);
  }
  throw new WaylineError("PROVIDER_UNAVAILABLE", `API: ${res.status}`);
}
