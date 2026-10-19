import { expose } from "comlink";
import { createPlannerApi } from "./plannerApi";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

expose(createPlannerApi(fetchJson));
