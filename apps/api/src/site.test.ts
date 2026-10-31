import { describe, expect, it } from "vitest";
import { previewImage, siteInfo } from "./site";

const page =
  (html: string, status = 200) =>
  () =>
    Promise.resolve(
      new Response(html, {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

describe("siteInfo", () => {
  it("finds the preview image", async () => {
    const html = `<head><meta content="/img/front.jpg" property="og:image"></head>`;
    expect(await siteInfo("https://hotel.example/", page(html))).toEqual({
      ok: true,
      image: "https://hotel.example/img/front.jpg",
    });
  });

  it("marks gone sites", async () => {
    expect(await siteInfo("https://x.example/", page("", 404))).toEqual({
      ok: false,
    });
    const down = () => Promise.reject(new Error("DNS"));
    expect(await siteInfo("https://x.example/", down)).toEqual({ ok: false });
  });

  it("keeps sites that block bots", async () => {
    expect(await siteInfo("https://x.example/", page("", 403))).toEqual({
      ok: true,
    });
  });
});

describe("previewImage", () => {
  it("falls back to the schema.org image", () => {
    expect(
      previewImage(
        `<img src="/logo.jpg"><img src="/front.jpg" itemprop="image">`,
        "https://a.example/de/",
      ),
    ).toBe("https://a.example/front.jpg");
  });

  it("upgrades http and skips other schemes", () => {
    expect(
      previewImage(
        `<meta property="og:image" content="http://a.example/b.jpg?x=1&amp;y=2">`,
        "https://a.example",
      ),
    ).toBe("https://a.example/b.jpg?x=1&y=2");
    expect(
      previewImage(`<meta property="og:image" content="data:x">`, "https://a"),
    ).toBeUndefined();
  });
});
