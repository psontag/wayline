import {
  type LonLat,
  type Profile,
  type ProviderEnvelope,
  SCHEMA_VERSION,
} from "@wayline/domain";
import {
  brouterProfileHash,
  fakeBrouterLeg,
  fetchBrouterLeg,
} from "@wayline/providers";

/** The part of D1 we use. Keeps this file free of Worker types. */
export type Db = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

export const LEG_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const BROUTER_TIMEOUT_MS = 30_000;

export type LegRouter = {
  provider: string;
  profileHash(profile: Profile): string;
  fetch(from: LonLat, to: LonLat, profile: Profile): Promise<ProviderEnvelope>;
};

/** A Workers VPC binding: fetch goes through the tunnel to BRouter. */
export type TunnelFetcher = { fetch: typeof fetch };

/** BRouter inside the tunnel. The VPC service picks the host, the path counts. */
const TUNNEL_BROUTER_URL = "http://brouter:17777";

/**
 * BRouter through the tunnel when the BROUTER binding exists (deployed),
 * else at BROUTER_URL (local), else the fake router.
 */
export function legRouter(
  brouterUrl: string | undefined,
  tunnel?: TunnelFetcher,
): LegRouter {
  if (tunnel) {
    return {
      provider: "brouter",
      profileHash: brouterProfileHash,
      fetch: (from, to, profile) =>
        fetchBrouterLeg(from, to, profile, {
          baseUrl: brouterUrl ?? TUNNEL_BROUTER_URL,
          fetch: (url) =>
            tunnel.fetch(url, {
              signal: AbortSignal.timeout(BROUTER_TIMEOUT_MS),
            }),
        }),
    };
  }
  if (!brouterUrl) {
    return {
      provider: "fake",
      profileHash: (profile) => `fake-${profile}`,
      fetch: async (from, to, profile) => fakeBrouterLeg(from, to, profile),
    };
  }
  return {
    provider: "brouter",
    profileHash: brouterProfileHash,
    fetch: (from, to, profile) =>
      fetchBrouterLeg(from, to, profile, {
        baseUrl: brouterUrl,
        fetch: (url) =>
          fetch(url, { signal: AbortSignal.timeout(BROUTER_TIMEOUT_MS) }),
      }),
  };
}

/** Custom points at 5 decimals, about 1 m. */
export function roundCoord([lon, lat]: LonLat): LonLat {
  return [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
}

export function legKey(
  provider: string,
  profileHash: string,
  from: LonLat,
  to: LonLat,
): string {
  return `v${SCHEMA_VERSION}:${provider}:${profileHash}:${from.join(",")};${to.join(",")}`;
}

export type LegResult = { envelope: ProviderEnvelope; cached: boolean };

/** Leg from the D1 cache, or from the router and then cached. */
export async function cachedLeg(
  db: Db,
  router: LegRouter,
  from: LonLat,
  to: LonLat,
  profile: Profile,
  now = Date.now(),
): Promise<LegResult> {
  const key = legKey(router.provider, router.profileHash(profile), from, to);
  const row = await db
    .prepare("SELECT envelope FROM legs WHERE key = ? AND expires_at > ?")
    .bind(key, now)
    .first<{ envelope: string }>();
  if (row) return { envelope: JSON.parse(row.envelope), cached: true };

  const envelope = await router.fetch(from, to, profile);
  await db
    .prepare(
      "INSERT OR REPLACE INTO legs (key, envelope, expires_at) VALUES (?, ?, ?)",
    )
    .bind(key, JSON.stringify(envelope), now + LEG_TTL_DAYS * DAY_MS)
    .run();
  return { envelope, cached: false };
}

export async function deleteExpiredLegs(db: Db, now = Date.now()) {
  await db.prepare("DELETE FROM legs WHERE expires_at <= ?").bind(now).run();
}
