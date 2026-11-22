import { describe, expect, it } from "vitest";
import { tileData } from "./lineTiles";

const tile = new Uint8Array([0x1a, 0x02, 0x08, 0x01]);

describe("tileData", () => {
  it("reads a tile", async () => {
    const res = new Response(tile, {
      headers: { "content-type": "application/x-protobuf" },
    });
    expect(new Uint8Array(await tileData(res))).toEqual(tile);
  });

  it("reads the app page for a missing file as empty", async () => {
    const res = new Response("<!doctype html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    expect((await tileData(res)).byteLength).toBe(0);
  });

  it("reads a 404 as empty", async () => {
    const res = new Response("Not found", { status: 404 });
    expect((await tileData(res)).byteLength).toBe(0);
  });

  it("fails on other errors", async () => {
    await expect(tileData(new Response("", { status: 500 }))).rejects.toThrow(
      "500",
    );
  });
});
