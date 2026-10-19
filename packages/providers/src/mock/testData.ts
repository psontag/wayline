/// <reference types="node" />
import { readFile } from "node:fs/promises";
import type { FetchJson } from "../types";

// Reads the committed mock files from disk. Only for tests in Node.
const dir = new URL(
  "../../../../apps/web/public/data/mock/oberfranken/",
  import.meta.url,
);

export const readMockFile: FetchJson = async (url) => {
  const name = url.split("/").pop() ?? "";
  return JSON.parse(await readFile(new URL(name, dir), "utf8"));
};
