import { zValidator } from "@hono/zod-validator";
import {
  type ApiErrorBody,
  type ErrorCode,
  RouteRequest,
  SCHEMA_VERSION,
  Shares,
  Trip,
  WaylineError,
} from "@wayline/domain";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodType } from "zod";
import { auth, type AuthBindings, type AuthVariables } from "./auth";
import type { Db } from "./db";
import { cachedLeg, legRouter, roundCoord } from "./legs";
import {
  deleteTrip,
  getShares,
  getTrip,
  listTrips,
  saveTrip,
  setShares,
} from "./trips";

export type Bindings = AuthBindings & {
  DB: Db;
  /** e.g. http://localhost:17777. Without it, the fake router answers. */
  BROUTER_URL?: string;
};

const status: Record<ErrorCode, ContentfulStatusCode> = {
  INVALID: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
};

/** Validates the JSON body. Errors come in our error shape. */
const json = <T extends ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const body: ApiErrorBody = {
        code: "INVALID",
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      };
      return c.json(body, 400);
    }
    return undefined;
  });

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
  .use("/api/me", auth)
  .use("/api/trips", auth)
  .use("/api/trips/*", auth)
  .get("/api/health", (c) =>
    c.json({ status: "ok", schemaVersion: SCHEMA_VERSION }),
  )
  .get("/api/me", (c) => c.json({ email: c.var.email }))
  .get("/api/trips", async (c) =>
    c.json(await listTrips(c.env.DB, c.var.email)),
  )
  .get("/api/trips/:id", async (c) =>
    c.json(await getTrip(c.env.DB, c.var.email, c.req.param("id"))),
  )
  .put("/api/trips/:id", json(Trip), async (c) => {
    const trip = c.req.valid("json");
    if (trip.id !== c.req.param("id")) {
      throw new WaylineError("INVALID", "id: does not match the URL");
    }
    return c.json(await saveTrip(c.env.DB, c.var.email, trip));
  })
  .delete("/api/trips/:id", async (c) => {
    await deleteTrip(c.env.DB, c.var.email, c.req.param("id"));
    return c.body(null, 204);
  })
  .get("/api/trips/:id/shares", async (c) => {
    const emails = await getShares(c.env.DB, c.var.email, c.req.param("id"));
    return c.json({ emails } satisfies Shares);
  })
  .put("/api/trips/:id/shares", json(Shares), async (c) => {
    const emails = await setShares(
      c.env.DB,
      c.var.email,
      c.req.param("id"),
      c.req.valid("json").emails,
    );
    return c.json({ emails } satisfies Shares);
  })
  .post("/api/route", json(RouteRequest), async (c) => {
    const { from, to, profile } = c.req.valid("json");
    const { envelope, cached } = await cachedLeg(
      c.env.DB,
      legRouter(c.env.BROUTER_URL),
      roundCoord(from),
      roundCoord(to),
      profile,
    );
    c.header("X-Cache", cached ? "HIT" : "MISS");
    return c.json(envelope);
  });

app.onError((error, c) => {
  if (error instanceof WaylineError) {
    const body: ApiErrorBody = {
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
    };
    return c.json(body, status[error.code]);
  }
  console.error(error);
  const body: ApiErrorBody = {
    code: "PROVIDER_UNAVAILABLE",
    message: "Internal error",
  };
  return c.json(body, 500);
});

export default app;
export type AppType = typeof app;
