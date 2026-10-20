import { describe, expect, it } from "vitest";
import { NAMES, setup, tunnelToken } from "./cloudflare";

type Call = { method: string; path: string; body?: unknown };

/** In-memory Cloudflare API with the endpoints setup uses. */
function fakeCloudflare({ zeroTrust = true, subdomain = "psontag" } = {}) {
  const state = {
    databases: [] as { uuid: string; name: string }[],
    tunnels: [] as { id: string; name: string }[],
    services: [] as Record<string, unknown>[],
    apps: [] as Record<string, unknown>[],
    subdomain: subdomain as string | undefined,
  };
  const calls: Call[] = [];
  let next = 1;
  const id = () => `id-${next++}`;

  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/client\/v4\/accounts\/acc/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const ok = (result: unknown) =>
      new Response(JSON.stringify({ success: true, result }));
    const fail = (status: number) =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 1, message: "no" }],
        }),
        { status },
      );

    const route = `${method} ${path}`;
    if (route === "GET /access/organizations")
      return zeroTrust
        ? ok({ auth_domain: "wayline.cloudflareaccess.com" })
        : fail(404);
    if (route === "GET /d1/database") return ok(state.databases);
    if (route === "POST /d1/database") {
      const db = { uuid: id(), name: body.name };
      state.databases.push(db);
      return ok(db);
    }
    if (route === "GET /cfd_tunnel") return ok(state.tunnels);
    if (route === "POST /cfd_tunnel") {
      const t = { id: id(), name: body.name };
      state.tunnels.push(t);
      return ok(t);
    }
    if (route.startsWith("GET /cfd_tunnel/") && path.endsWith("/token"))
      return ok("tunnel-token");
    if (route === "GET /connectivity/directory/services")
      return ok(state.services);
    if (route === "POST /connectivity/directory/services") {
      const s = { ...body, service_id: id() };
      state.services.push(s);
      return ok(s);
    }
    if (route.startsWith("PUT /connectivity/directory/services/"))
      return ok({});
    if (route === "GET /workers/subdomain")
      return state.subdomain ? ok({ subdomain: state.subdomain }) : fail(404);
    if (route === "PUT /workers/subdomain") {
      state.subdomain = body.subdomain;
      return ok(body);
    }
    if (route === "GET /access/apps") return ok(state.apps);
    if (route === "POST /access/apps") {
      const app = { ...body, id: id(), aud: "aud-1" };
      state.apps.push(app);
      return ok(app);
    }
    if (route.startsWith("PUT /access/apps/")) {
      const app = state.apps.find((a) => path.endsWith(String(a.id)));
      Object.assign(app ?? {}, body);
      return ok(app);
    }
    return fail(500);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls, state };
}

const base = { token: "t", accountId: "acc" };
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("Cloudflare setup", () => {
  it("creates everything on a new account", async () => {
    const cf = fakeCloudflare();
    const result = await setup({
      ...base,
      emails: ["a@x.de"],
      fetch: cf.fetch,
    });
    expect(result).toEqual({
      WAYLINE_D1_ID: "id-1",
      WAYLINE_TUNNEL_ID: "id-2",
      WAYLINE_BROUTER_SERVICE_ID: "id-3",
      WAYLINE_ACCESS_TEAM_DOMAIN: "https://wayline.cloudflareaccess.com",
      WAYLINE_ACCESS_AUD: "aud-1",
      WAYLINE_URL: "https://wayline-api.psontag.workers.dev",
    });
    const service = cf.state.services[0];
    expect(service).toMatchObject({
      type: "http",
      http_port: 17777,
      host: { hostname: "brouter", resolver_network: { tunnel_id: "id-2" } },
    });
    expect(cf.state.apps[0]).toMatchObject({
      domain: "wayline-api.psontag.workers.dev",
      policies: [
        { decision: "allow", include: [{ email: { email: "a@x.de" } }] },
      ],
    });
  });

  it("changes nothing on a second run", async () => {
    const cf = fakeCloudflare();
    const first = await setup({ ...base, emails: ["a@x.de"], fetch: cf.fetch });
    cf.calls.length = 0;
    const second = await setup({
      ...base,
      emails: ["a@x.de"],
      fetch: cf.fetch,
    });
    expect(second).toEqual(first);
    expect(writes(cf.calls)).toEqual([]);
  });

  it("updates the allowed emails", async () => {
    const cf = fakeCloudflare();
    await setup({ ...base, emails: ["a@x.de"], fetch: cf.fetch });
    cf.calls.length = 0;
    await setup({ ...base, emails: ["a@x.de", " b@x.de "], fetch: cf.fetch });
    expect(writes(cf.calls).map((c) => c.method + " " + c.path)).toEqual([
      "PUT /access/apps/id-4",
    ]);
    expect(JSON.stringify(cf.state.apps[0])).toContain("b@x.de");
  });

  it("creates a workers.dev subdomain when the account has none", async () => {
    const cf = fakeCloudflare({ subdomain: "" });
    const result = await setup({
      ...base,
      emails: ["a@x.de"],
      fetch: cf.fetch,
    });
    expect(result.WAYLINE_URL).toBe(
      "https://wayline-api.wayline-acc.workers.dev",
    );
  });

  it("explains a missing Zero Trust organization", async () => {
    const cf = fakeCloudflare({ zeroTrust: false });
    await expect(
      setup({ ...base, emails: ["a@x.de"], fetch: cf.fetch }),
    ).rejects.toThrow(/Sign up for Zero Trust/);
    expect(writes(cf.calls)).toEqual([]);
  });

  it("needs at least one email", async () => {
    const cf = fakeCloudflare();
    await expect(
      setup({ ...base, emails: [" "], fetch: cf.fetch }),
    ).rejects.toThrow(/ACCESS_EMAILS/);
  });

  it("gets the tunnel token for cloudflared", async () => {
    const cf = fakeCloudflare();
    await expect(tunnelToken({ ...base, fetch: cf.fetch })).rejects.toThrow(
      new RegExp(NAMES.tunnel),
    );
    await setup({ ...base, emails: ["a@x.de"], fetch: cf.fetch });
    expect(await tunnelToken({ ...base, fetch: cf.fetch })).toBe(
      "tunnel-token",
    );
  });
});
