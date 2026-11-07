import { expose } from "comlink";
import { dataUrl } from "./dataUrl";
import { LocalRouting } from "./LocalRouting";
import { createPlannerApi } from "./plannerApi";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// VITE_ROUTING=local routes the chosen proposals. Else they keep the graph path.
const routing =
  import.meta.env.VITE_ROUTING === "local"
    ? new LocalRouting(dataUrl())
    : undefined;

expose(createPlannerApi(fetchJson, routing));
