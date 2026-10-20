import { ApiErrorBody, ProviderEnvelope } from "@wayline/domain";
import { parseBrouterLeg } from "@wayline/providers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app, { type Bindings } from "./app";
import type { Db } from "./db";
import { cachedLeg, deleteExpiredLegs, legRouter } from "./legs";
import { openTestDb } from "./testDb";

let db: Db;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ db, dispose } = await openTestDb());
});

afterAll(() => dispose());

const bamberg = [10.887312, 49.891734];
const forchheim = [11.0587, 49.7186];

function post(body: unknown, env: Partial<Bindings> = {}) {
  return app.request(
    "/api/route",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { DB: db, ...env },
  );
}

describe("POST /api/route", () => {
  it("routes with the fake router, then answers from the cache", async () => {
    const body = { from: bamberg, to: forchheim, profile: "touring" };
    const first = await post(body);
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Cache")).toBe("MISS");
    const envelope = ProviderEnvelope.parse(await first.json());
    expect(envelope).toMatchObject({
      provider: "fake",
      profileHash: "fake-touring",
    });

    const second = await post(body);
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(await second.json()).toEqual(envelope);

    // The browser parses the envelope into a leg.
    const leg = parseBrouterLeg(
      envelope,
      [10.88731, 49.89173],
      [11.0587, 49.7186],
    );
    expect(leg.distance).toBeGreaterThan(20_000);
    expect(leg.surface.paved).toBe(1);
  });

  it("keys legs by profile and rounded coordinates", async () => {
    await post({ from: [9.1, 48.1], to: [9.2, 48.2], profile: "fast" });
    const near = await post({
      from: [9.100001, 48.100001],
      to: [9.2, 48.2],
      profile: "fast",
    });
    expect(near.headers.get("X-Cache")).toBe("HIT");
    const other = await post({
      from: [9.1, 48.1],
      to: [9.2, 48.2],
      profile: "quiet",
    });
    expect(other.headers.get("X-Cache")).toBe("MISS");
  });

  it("rejects invalid requests", async () => {
    const res = await post({ from: bamberg, profile: "racing" });
    expect(res.status).toBe(400);
    const body = ApiErrorBody.parse(await res.json());
    expect(body.code).toBe("INVALID");
    expect(body.message).toContain("to");
  });

  it("reports an unreachable router as PROVIDER_UNAVAILABLE", async () => {
    const res = await post(
      { from: [8.1, 49.1], to: [8.2, 49.2], profile: "touring" },
      // Nothing listens on port 9.
      { BROUTER_URL: "http://127.0.0.1:9" },
    );
    expect(res.status).toBe(502);
    expect(ApiErrorBody.parse(await res.json()).code).toBe(
      "PROVIDER_UNAVAILABLE",
    );
  });
});

describe("leg cache", () => {
  it("expires legs after 30 days and deletes them", async () => {
    const router = legRouter(undefined);
    const day = 24 * 60 * 60 * 1000;
    const t0 = Date.UTC(2027, 5, 1);
    const from: [number, number] = [10, 50];
    const to: [number, number] = [10.1, 50.1];
    await cachedLeg(db, router, from, to, "scenic", t0);
    expect(
      (await cachedLeg(db, router, from, to, "scenic", t0 + 29 * day)).cached,
    ).toBe(true);
    expect(
      (await cachedLeg(db, router, from, to, "scenic", t0 + 31 * day)).cached,
    ).toBe(false);

    // The refetch at day 31 set a new expiry. Delete as if 62 days later.
    await deleteExpiredLegs(db, t0 + 62 * day);
    const row = await db
      .prepare("SELECT count(*) AS n FROM legs WHERE key LIKE ?")
      .bind("%fake-scenic%")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
