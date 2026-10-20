import { WaylineError } from "@wayline/domain";
import { createMiddleware } from "hono/factory";
import { verifyWithJwks } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";

export type AuthBindings = {
  /** e.g. https://<team>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;
  /** Local development without Access. Ignored when Access is set up. */
  DEV_USER_EMAIL?: string;
};

export type AuthVariables = { email: string };

const KEYS_TTL_MS = 60 * 60 * 1000;
let keyCache: { url: string; keys: HonoJsonWebKey[]; at: number } | undefined;

async function accessKeys(url: string, refresh: boolean) {
  if (
    !refresh &&
    keyCache?.url === url &&
    Date.now() - keyCache.at < KEYS_TTL_MS
  ) {
    return keyCache.keys;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const { keys } = (await res.json()) as { keys: HonoJsonWebKey[] };
  keyCache = { url, keys, at: Date.now() };
  return keys;
}

/** Email from a Cloudflare Access JWT. Throws if the token is not valid. */
export async function accessEmail(
  token: string,
  options: { teamDomain: string; aud: string; keys: HonoJsonWebKey[] },
): Promise<string> {
  const payload = await verifyWithJwks(token, {
    keys: options.keys,
    allowedAlgorithms: ["RS256"],
    verification: { iss: options.teamDomain, aud: options.aud },
  });
  if (typeof payload.email !== "string" || !payload.email) {
    throw new Error("Access token without email");
  }
  return payload.email.toLowerCase();
}

/**
 * Sets the user's email from the Access JWT. Without Access settings it
 * takes DEV_USER_EMAIL. No email: UNAUTHORIZED.
 */
export const auth = createMiddleware<{
  Bindings: AuthBindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, DEV_USER_EMAIL } = c.env;
  let email: string | undefined;
  if (ACCESS_TEAM_DOMAIN && ACCESS_AUD) {
    const token = c.req.header("Cf-Access-Jwt-Assertion");
    if (token) {
      const teamDomain = ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
      const certs = `${teamDomain}/cdn-cgi/access/certs`;
      const verify = async (refresh: boolean) =>
        accessEmail(token, {
          teamDomain,
          aud: ACCESS_AUD,
          keys: await accessKeys(certs, refresh),
        });
      // A failure with cached keys may be a key rotation. Retry with fresh keys.
      email = await verify(false)
        .catch(() => verify(true))
        .catch(() => undefined);
    }
  } else if (DEV_USER_EMAIL) {
    email = DEV_USER_EMAIL.toLowerCase();
  }
  if (!email) throw new WaylineError("UNAUTHORIZED", "Not logged in");
  c.set("email", email);
  await next();
});
