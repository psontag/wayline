import { expose } from "comlink";
import { createApiClient } from "./apiClient";
import { ApiRouting } from "./ApiRouting";
import { createPlannerApi } from "./plannerApi";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// VITE_ROUTING=api routes the chosen proposals. Else they keep the graph path.
const routing =
  import.meta.env.VITE_ROUTING === "api"
    ? new ApiRouting(createApiClient(`${self.location.origin}/`))
    : undefined;

expose(createPlannerApi(fetchJson, routing));
