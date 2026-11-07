/// <reference types="node" />
import { readFile } from "node:fs/promises";

// Serves the files of packages/router/fixtures. Only for tests in Node.
const root = new URL("../fixtures/", import.meta.url);

/** fetch for URLs under /fixture/. Missing files answer 404. */
export async function fetchFixture(
  input: string | URL | Request,
): Promise<Response> {
  const path = String(input).replace(/^\/fixture\//, "");
  try {
    return new Response(new Uint8Array(await readFile(new URL(path, root))));
  } catch {
    return new Response(null, { status: 404 });
  }
}
