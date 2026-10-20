// Creates or updates the Cloudflare resources Wayline needs: the D1
// database, the tunnel to BRouter, its Workers VPC service and the Access
// app on the workers.dev address. Safe to run again: it finds each resource
// by name and only creates or updates what differs.
// Run by scripts/setup-cloudflare.ts in CI before the deploy.

const API = "https://api.cloudflare.com/client/v4";

export const NAMES = {
  database: "wayline",
  worker: "wayline-api",
  tunnel: "wayline-brouter",
  service: "wayline-brouter",
  app: "Wayline",
  policy: "Allowed emails",
};

/** BRouter as seen from cloudflared: the container name and port in compose.yaml. */
export const BROUTER_HOST = { hostname: "brouter", port: 17777 };
/** Users stay logged in for 30 days. */
const SESSION_DURATION = "720h";

export type SetupOptions = {
  token: string;
  accountId: string;
  /** Emails that may log in. */
  emails: string[];
  fetch?: typeof fetch;
  log?: (message: string) => void;
};

/** Values the build needs, as env names for cloudflare.config.ts. */
export type SetupResult = {
  WAYLINE_D1_ID: string;
  WAYLINE_TUNNEL_ID: string;
  WAYLINE_BROUTER_SERVICE_ID: string;
  WAYLINE_ACCESS_TEAM_DOMAIN: string;
  WAYLINE_ACCESS_AUD: string;
  WAYLINE_URL: string;
};

type Envelope<T> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
};

export class CloudflareError extends Error {
  readonly status: number;
  readonly codes: number[];

  constructor(status: number, codes: number[], message: string) {
    super(message);
    this.status = status;
    this.codes = codes;
  }
}

/** Small client for the Cloudflare API. */
export function client({
  token,
  accountId,
  fetch: doFetch = fetch,
}: Pick<SetupOptions, "token" | "accountId" | "fetch">) {
  return async function api<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await doFetch(`${API}/accounts/${accountId}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as Envelope<T>;
    if (!res.ok || !json.success) {
      const errors = json.errors ?? [];
      throw new CloudflareError(
        res.status,
        errors.map((e) => e.code),
        `${method} ${path}: ${errors.map((e) => e.message).join("; ") || res.status}`,
      );
    }
    return json.result;
  };
}

type Api = ReturnType<typeof client>;

export async function setup(options: SetupOptions): Promise<SetupResult> {
  const api = client(options);
  const log = options.log ?? (() => {});
  const emails = [...new Set(options.emails.map((e) => e.trim()))].filter(
    Boolean,
  );
  if (!emails.length)
    throw new Error("No emails for Access. Set ACCESS_EMAILS.");

  const teamDomain = await accessTeamDomain(api);
  const database = await ensureDatabase(api, log);
  const tunnel = await ensureTunnel(api, log);
  const service = await ensureService(api, tunnel, log);
  const host = `${NAMES.worker}.${await ensureSubdomain(api, options.accountId, log)}.workers.dev`;
  const aud = await ensureAccessApp(api, host, emails, log);

  return {
    WAYLINE_D1_ID: database,
    WAYLINE_TUNNEL_ID: tunnel,
    WAYLINE_BROUTER_SERVICE_ID: service,
    WAYLINE_ACCESS_TEAM_DOMAIN: `https://${teamDomain}`,
    WAYLINE_ACCESS_AUD: aud,
    WAYLINE_URL: `https://${host}`,
  };
}

/** The Zero Trust team domain. The organization can only be made by signing up. */
async function accessTeamDomain(api: Api): Promise<string> {
  try {
    const org = await api<{ auth_domain: string }>(
      "GET",
      "/access/organizations",
    );
    return org.auth_domain;
  } catch (error) {
    const reason = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      `No Zero Trust organization with Access. Sign up for Zero Trust (Free plan) in the dashboard first${reason}.`,
      { cause: error },
    );
  }
}

async function ensureDatabase(api: Api, log: (m: string) => void) {
  const found = await api<{ uuid: string; name: string }[]>(
    "GET",
    `/d1/database?name=${NAMES.database}`,
  );
  const db = found.find((d) => d.name === NAMES.database);
  if (db) return db.uuid;
  log(`Creating D1 database ${NAMES.database}`);
  const created = await api<{ uuid: string }>("POST", "/d1/database", {
    name: NAMES.database,
  });
  return created.uuid;
}

async function ensureTunnel(api: Api, log: (m: string) => void) {
  const found = await api<{ id: string; name: string }[]>(
    "GET",
    `/cfd_tunnel?name=${NAMES.tunnel}&is_deleted=false`,
  );
  const tunnel = found.find((t) => t.name === NAMES.tunnel);
  if (tunnel) return tunnel.id;
  log(`Creating tunnel ${NAMES.tunnel}`);
  const created = await api<{ id: string }>("POST", "/cfd_tunnel", {
    name: NAMES.tunnel,
    config_src: "cloudflare",
  });
  return created.id;
}

type Service = {
  service_id: string;
  name: string;
  type: string;
  http_port?: number;
  host?: { hostname?: string; resolver_network?: { tunnel_id?: string } };
};

async function ensureService(
  api: Api,
  tunnelId: string,
  log: (m: string) => void,
) {
  const wanted = {
    name: NAMES.service,
    type: "http",
    http_port: BROUTER_HOST.port,
    host: {
      hostname: BROUTER_HOST.hostname,
      resolver_network: { tunnel_id: tunnelId },
    },
  };
  const found = await api<Service[]>("GET", "/connectivity/directory/services");
  const service = found.find((s) => s.name === NAMES.service);
  if (!service) {
    log(`Creating VPC service ${NAMES.service}`);
    const created = await api<Service>(
      "POST",
      "/connectivity/directory/services",
      wanted,
    );
    return created.service_id;
  }
  const same =
    service.http_port === wanted.http_port &&
    service.host?.hostname === wanted.host.hostname &&
    service.host?.resolver_network?.tunnel_id === tunnelId;
  if (!same) {
    log(`Updating VPC service ${NAMES.service}`);
    await api(
      "PUT",
      `/connectivity/directory/services/${service.service_id}`,
      wanted,
    );
  }
  return service.service_id;
}

/** The account's workers.dev subdomain. New accounts get one. */
async function ensureSubdomain(
  api: Api,
  accountId: string,
  log: (m: string) => void,
) {
  try {
    const { subdomain } = await api<{ subdomain: string }>(
      "GET",
      "/workers/subdomain",
    );
    if (subdomain) return subdomain;
  } catch (error) {
    if (!(error instanceof CloudflareError) || error.status !== 404) {
      throw error;
    }
  }
  const subdomain = `wayline-${accountId.slice(0, 6)}`;
  log(`Creating workers.dev subdomain ${subdomain}`);
  await api("PUT", "/workers/subdomain", { subdomain });
  return subdomain;
}

type AccessApp = {
  id: string;
  aud: string;
  domain: string;
  session_duration?: string;
  policies?: {
    name: string;
    decision: string;
    include: { email?: { email: string } }[];
  }[];
};

async function ensureAccessApp(
  api: Api,
  host: string,
  emails: string[],
  log: (m: string) => void,
) {
  const wanted = {
    name: NAMES.app,
    type: "self_hosted",
    domain: host,
    session_duration: SESSION_DURATION,
    app_launcher_visible: false,
    policies: [
      {
        name: NAMES.policy,
        decision: "allow",
        include: emails.map((email) => ({ email: { email } })),
      },
    ],
  };
  const apps = await api<AccessApp[]>("GET", "/access/apps");
  const app = apps.find((a) => a.domain === host);
  if (!app) {
    log(`Creating Access app for ${host}`);
    const created = await api<AccessApp>("POST", "/access/apps", wanted);
    return created.aud;
  }
  const allowed = new Set(
    (app.policies ?? [])
      .filter((p) => p.name === NAMES.policy && p.decision === "allow")
      .flatMap((p) => p.include.map((i) => i.email?.email)),
  );
  const same =
    app.session_duration === SESSION_DURATION &&
    allowed.size === emails.length &&
    emails.every((e) => allowed.has(e));
  if (!same) {
    log(`Updating Access app for ${host} (${emails.length} emails)`);
    await api("PUT", `/access/apps/${app.id}`, wanted);
  }
  return app.aud;
}

/** Token for cloudflared on the machine that runs BRouter. */
export async function tunnelToken(
  options: Pick<SetupOptions, "token" | "accountId" | "fetch">,
): Promise<string> {
  const api = client(options);
  const found = await api<{ id: string; name: string }[]>(
    "GET",
    `/cfd_tunnel?name=${NAMES.tunnel}&is_deleted=false`,
  );
  const tunnel = found.find((t) => t.name === NAMES.tunnel);
  if (!tunnel) {
    throw new Error(
      `No tunnel ${NAMES.tunnel} yet. It is created by the first deploy.`,
    );
  }
  return api<string>("GET", `/cfd_tunnel/${tunnel.id}/token`);
}
