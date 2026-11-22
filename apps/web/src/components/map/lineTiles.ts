import { addProtocol } from "maplibre-gl";

/** URL scheme of the line tiles. Swap it for the page's own to fetch them. */
export const LINES_PROTOCOL = "wayline-lines";

/**
 * Tiles without routes have no file, to stay under the host's file limit.
 * The host answers a missing file with the app page or a 404. Both read as
 * an empty tile.
 */
export async function tileData(res: Response): Promise<ArrayBuffer> {
  const html = res.headers.get("content-type")?.includes("text/html");
  if (res.status === 404 || (res.ok && html)) return new ArrayBuffer(0);
  if (!res.ok) throw new Error(`${res.status} ${res.url}`);
  return res.arrayBuffer();
}

export function registerLineTiles() {
  addProtocol(LINES_PROTOCOL, async (params, abort) => {
    const url = params.url.replace(`${LINES_PROTOCOL}:`, location.protocol);
    const res = await fetch(url, { signal: abort.signal });
    return { data: await tileData(res) };
  });
}
