import type { SiteInfo } from "@wayline/domain";

const TIMEOUT_MS = 6000;
/** og:image sits in <head>. No need to read more. */
const MAX_HTML = 200_000;
const CACHE_SECONDS = 7 * 24 * 3600;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Whether a hotel website still works, and its preview image. Bot blocks
 * (401, 403, 429) count as working: the site is there.
 */
export async function siteInfo(
  url: string,
  fetcher: Fetch = fetch,
): Promise<SiteInfo> {
  let res: Response;
  try {
    res = await fetcher(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Wayline (bike trip planner)" },
    });
  } catch {
    return { ok: false };
  }
  if (res.status === 404 || res.status === 410 || res.status >= 500) {
    return { ok: false };
  }
  if (!res.ok) return { ok: true };
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) return { ok: true };
  const html = (await res.text()).slice(0, MAX_HTML);
  const image = previewImage(html, res.url || url);
  return image ? { ok: true, image } : { ok: true };
}

/** Where pages name their preview image, best first. */
const IMAGE_SOURCES: [tag: RegExp, attr: string][] = [
  [/(property|name)\s*=\s*["']og:image(:url)?["']/i, "content"],
  [/name\s*=\s*["']twitter:image["']/i, "content"],
  [/itemprop\s*=\s*["']image["']/i, "src"],
  [/itemprop\s*=\s*["']image["']/i, "content"],
];

/** The preview image of a page as an absolute https URL. */
export function previewImage(html: string, base: string): string | undefined {
  const tags = html.match(/<(meta|img)\b[^>]*>/gi) ?? [];
  for (const [pattern, attr] of IMAGE_SOURCES) {
    for (const tag of tags) {
      if (!pattern.test(tag)) continue;
      const value = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i").exec(
        tag,
      )?.[1];
      const image = value && httpsUrl(value, base);
      if (image) return image;
    }
  }
  return undefined;
}

function httpsUrl(value: string, base: string): string | undefined {
  try {
    const url = new URL(value.replaceAll("&amp;", "&"), base);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** siteInfo through the Workers cache, a week per URL. */
export async function cachedSiteInfo(url: string): Promise<SiteInfo> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches
    ?.default;
  const key = `https://wayline.cache/site/v2?url=${encodeURIComponent(url)}`;
  const hit = await cache?.match(key);
  if (hit) return hit.json();
  const info = await siteInfo(url);
  await cache?.put(
    key,
    new Response(JSON.stringify(info), {
      headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` },
    }),
  );
  return info;
}
