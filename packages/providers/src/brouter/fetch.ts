import {
  type LonLat,
  type Profile,
  type ProviderEnvelope,
  WaylineError,
} from "@wayline/domain";
import type { AbortSignalLike } from "../types";
import { brouterProfileHash } from "./profiles";

/** The part of fetch we use. Works without DOM or Worker types. */
export type HttpFetch = (
  url: string,
  init?: { signal?: AbortSignalLike },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type BrouterOptions = {
  /** e.g. http://localhost:17777 */
  baseUrl: string;
  fetch: HttpFetch;
  signal?: AbortSignalLike;
};

export function brouterUrl(
  baseUrl: string,
  from: LonLat,
  to: LonLat,
  profile: Profile,
): string {
  const lonlats = [from, to].map(([lon, lat]) => `${lon},${lat}`).join("|");
  const query = `lonlats=${encodeURIComponent(lonlats)}&profile=${profile}&alternativeidx=0&format=geojson`;
  return `${baseUrl.replace(/\/$/, "")}/brouter?${query}`;
}

/**
 * Fetch half: routes one leg. Our presets have the same names as their
 * BRouter profiles.
 */
export async function fetchBrouterLeg(
  from: LonLat,
  to: LonLat,
  profile: Profile,
  options: BrouterOptions,
): Promise<ProviderEnvelope> {
  const url = brouterUrl(options.baseUrl, from, to, profile);
  let res: Awaited<ReturnType<HttpFetch>>;
  try {
    res = await options.fetch(url, { signal: options.signal });
  } catch (error) {
    throw new WaylineError("PROVIDER_UNAVAILABLE", `BRouter: ${error}`);
  }
  const text = await res.text();
  // BRouter answers 400 with a plain text reason when there is no route,
  // e.g. "datafile E20_N60.rd5 not found" or "target island detected".
  if (res.status === 400) {
    throw new WaylineError("INVALID", `BRouter: ${text.trim()}`);
  }
  if (!res.ok) {
    throw new WaylineError(
      "PROVIDER_UNAVAILABLE",
      `BRouter: ${res.status} ${text.trim()}`.trim(),
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new WaylineError("PROVIDER_UNAVAILABLE", "BRouter: invalid JSON");
  }
  return { provider: "brouter", profileHash: brouterProfileHash(profile), raw };
}
