export const MOCK_DATA = "/data/mock/oberfranken";

/**
 * The region data named by /data/latest.json, if it is there.
 * Else, or with VITE_DATA=mock, the Oberfranken mock.
 */
export async function dataUrl(): Promise<string> {
  if (import.meta.env.VITE_DATA === "mock") return MOCK_DATA;
  try {
    const res = await fetch("/data/latest.json");
    const latest = (await res.json()) as { version?: unknown };
    if (typeof latest.version === "string") return `/data/${latest.version}`;
  } catch {
    // Not built. The dev server answers with index.html, which is no JSON.
  }
  return MOCK_DATA;
}
