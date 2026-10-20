import { ApiErrorBody, parseTrip, type Trip } from "@wayline/domain";
import { sign } from "hono/jwt";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import app, { type Bindings } from "./app";
import { accessEmail } from "./auth";
import type { Db } from "./db";
import { openTestDb } from "./testDb";

let db: Db;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ db, dispose } = await openTestDb());
});

afterAll(() => dispose());

const anna = "anna@example.com";
const ben = "ben@example.com";

function call(
  method: string,
  path: string,
  options: { user?: string; body?: unknown; env?: Partial<Bindings> } = {},
) {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    { DB: db, DEV_USER_EMAIL: options.user, ...options.env },
  );
}

async function errorCode(res: Response) {
  return ApiErrorBody.parse(await res.json()).code;
}

function trip(id: string, name = "Main loop"): Trip {
  return parseTrip({
    schemaVersion: 1,
    id,
    name,
    owner: "me",
    createdAt: "2026-10-20T08:00:00.000Z",
    updatedAt: "2026-10-20T08:00:00.000Z",
    kind: "one-way",
    settings: { profile: "touring", kmPerDay: 80, maxAscentPerDay: 1200 },
    stages: [],
  });
}

describe("auth", () => {
  it("answers /api/me with the dev user", async () => {
    const res = await call("GET", "/api/me", { user: "Anna@Example.com" });
    expect(await res.json()).toEqual({ email: anna });
  });

  it("rejects requests without a user", async () => {
    const res = await call("GET", "/api/trips");
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHORIZED");
  });

  it("ignores the dev user when Access is set up", async () => {
    const res = await call("GET", "/api/me", {
      user: anna,
      env: { ACCESS_TEAM_DOMAIN: "https://t.example", ACCESS_AUD: "aud" },
    });
    expect(res.status).toBe(401);
    const half = await call("GET", "/api/me", {
      user: anna,
      env: { ACCESS_AUD: "aud" },
    });
    expect(half.status).toBe(401);
  });
});

describe("Access JWT", () => {
  const team = "https://team.cloudflareaccess.com";
  const aud = "aud-tag";
  let keys: { private: JsonWebKey; public: JsonWebKey };

  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const jwk = async (key: CryptoKey) => ({
      ...((await crypto.subtle.exportKey("jwk", key)) as JsonWebKey),
      kid: "k1",
      alg: "RS256",
    });
    keys = {
      private: await jwk(pair.privateKey),
      public: await jwk(pair.publicKey),
    };
  });

  afterEach(() => vi.unstubAllGlobals());

  const token = (claims: Record<string, unknown>) =>
    sign(
      {
        iss: team,
        aud: [aud],
        email: "Anna@example.com",
        exp: Math.floor(Date.now() / 1000) + 60,
        ...claims,
      },
      keys.private as never,
    );

  it("takes the email from a valid token", async () => {
    const options = { teamDomain: team, aud, keys: [keys.public as never] };
    expect(await accessEmail(await token({}), options)).toBe(anna);
    await expect(
      accessEmail(await token({ aud: ["other"] }), options),
    ).rejects.toThrow();
    await expect(
      accessEmail(await token({ iss: "https://evil.example" }), options),
    ).rejects.toThrow();
    await expect(
      accessEmail(await token({ exp: 1 }), options),
    ).rejects.toThrow();
  });

  it("verifies the header with the team's certs", async () => {
    const fetch = vi.fn(async () => Response.json({ keys: [keys.public] }));
    vi.stubGlobal("fetch", fetch);
    const env = { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud };
    const res = await app.request(
      "/api/me",
      { headers: { "Cf-Access-Jwt-Assertion": await token({}) } },
      { DB: db, ...env },
    );
    expect(await res.json()).toEqual({ email: anna });
    expect(fetch).toHaveBeenCalledWith(`${team}/cdn-cgi/access/certs`);
  });
});

describe("trips", () => {
  it("saves, lists, loads and deletes a trip", async () => {
    const res = await call("PUT", "/api/trips/t1", {
      user: anna,
      body: trip("t1"),
    });
    expect(res.status).toBe(200);
    const saved = parseTrip(await res.json());
    expect(saved.owner).toBe(anna);
    expect(saved.updatedAt > "2026-10-20T08:00:00.000Z").toBe(true);

    const list = await (await call("GET", "/api/trips", { user: anna })).json();
    expect(list).toEqual([
      expect.objectContaining({ id: "t1", name: "Main loop", owner: anna }),
    ]);

    const renamed = await call("PUT", "/api/trips/t1", {
      user: anna,
      body: { ...saved, name: "Renamed" },
    });
    expect(parseTrip(await renamed.json()).name).toBe("Renamed");
    const loaded = await call("GET", "/api/trips/t1", { user: anna });
    expect(parseTrip(await loaded.json()).name).toBe("Renamed");

    expect((await call("DELETE", "/api/trips/t1", { user: anna })).status).toBe(
      204,
    );
    const gone = await call("GET", "/api/trips/t1", { user: anna });
    expect(await errorCode(gone)).toBe("NOT_FOUND");
  });

  it("fails with CONFLICT on a stale updatedAt", async () => {
    const first = parseTrip(
      await (
        await call("PUT", "/api/trips/t2", { user: anna, body: trip("t2") })
      ).json(),
    );
    await call("PUT", "/api/trips/t2", { user: anna, body: first });
    const stale = await call("PUT", "/api/trips/t2", {
      user: anna,
      body: first,
    });
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe("CONFLICT");
  });

  it("keeps trips apart per user", async () => {
    const saved = parseTrip(
      await (
        await call("PUT", "/api/trips/t3", { user: anna, body: trip("t3") })
      ).json(),
    );
    const list = await (await call("GET", "/api/trips", { user: ben })).json();
    expect(list).toEqual([]);
    for (const [method, body] of [
      ["GET", undefined],
      ["PUT", saved],
      ["DELETE", undefined],
    ] as const) {
      const res = await call(method, "/api/trips/t3", { user: ben, body });
      expect(await errorCode(res)).toBe("NOT_FOUND");
    }
    const still = await call("GET", "/api/trips/t3", { user: anna });
    expect(still.status).toBe(200);
  });

  it("rejects invalid trips", async () => {
    const wrongId = await call("PUT", "/api/trips/x", {
      user: anna,
      body: trip("y"),
    });
    expect(await errorCode(wrongId)).toBe("INVALID");
    const broken = await call("PUT", "/api/trips/x", {
      user: anna,
      body: { id: "x" },
    });
    expect(await errorCode(broken)).toBe("INVALID");
  });
});
