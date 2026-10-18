import { SCHEMA_VERSION } from "@wayline/domain";
import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) =>
  c.json({ status: "ok", schemaVersion: SCHEMA_VERSION }),
);

export default app;
