import { zValidator } from "@hono/zod-validator";
import {
  type ApiErrorBody,
  type ErrorCode,
  RouteRequest,
  SCHEMA_VERSION,
  WaylineError,
} from "@wayline/domain";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { cachedLeg, type Db, legRouter, roundCoord } from "./legs";

export type Bindings = {
  DB: Db;
  /** e.g. http://localhost:17777. Without it, the fake router answers. */
  BROUTER_URL?: string;
};

const status: Record<ErrorCode, ContentfulStatusCode> = {
  INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
};

const app = new Hono<{ Bindings: Bindings }>()
  .get("/api/health", (c) =>
    c.json({ status: "ok", schemaVersion: SCHEMA_VERSION }),
  )
  .post(
    "/api/route",
    zValidator("json", RouteRequest, (result, c) => {
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
    }),
    async (c) => {
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
    },
  );

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
