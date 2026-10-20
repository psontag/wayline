/// <reference types="node" />
import { readFile } from "node:fs/promises";
import type { FetchJson } from "../types";

// Reads the committed mock files from disk. Only for tests in Node.
const root = new URL("../../../../apps/web/public/data/", import.meta.url);

/** Reads files of /data/mock/oberfranken. Ignores the base URL. */
export const readMockFile: FetchJson = async (url) => {
  const name = url.split("/").pop() ?? "";
  return JSON.parse(
    await readFile(new URL(`mock/oberfranken/${name}`, root), "utf8"),
  );
};

/** Reads files under /data/, e.g. "/data/mock/heidelberg/tiles/17_98.json". */
export const readDataFile: FetchJson = async (url) => {
  const path = url.replace(/^\/data\//, "");
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
};
