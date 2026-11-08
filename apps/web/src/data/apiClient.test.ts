import { isErrorCode } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import { createApiClient, readJson } from "./apiClient";

describe("createApiClient", () => {
  it("turns a failed connection into OFFLINE", async () => {
    const client = createApiClient("http://w", async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await client.api.trips.$get().catch((e: unknown) => e);
    expect(isErrorCode(error, "OFFLINE")).toBe(true);
  });

  it("passes aborts through", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    const client = createApiClient("http://w", async () => {
      throw abort;
    });
    await expect(client.api.trips.$get()).rejects.toBe(abort);
  });
});

describe("readJson", () => {
  it("reads the API error shape", async () => {
    const res = Response.json(
      { code: "INTERNAL", message: "x" },
      { status: 500 },
    );
    const error = await readJson(res).catch((e: unknown) => e);
    expect(isErrorCode(error, "INTERNAL")).toBe(true);
  });
});
