import { expose } from "comlink";
import { createApiClient } from "./apiClient";
import { ApiRouting } from "./ApiRouting";
import { dataUrl } from "./dataUrl";
import { LocalRouting } from "./LocalRouting";
import { createPlannerApi } from "./plannerApi";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// VITE_ROUTING=api or local routes the chosen proposals. Else they keep the graph path.
function createRouting() {
  switch (import.meta.env.VITE_ROUTING) {
    case "api":
      return new ApiRouting(createApiClient(`${self.location.origin}/`));
    case "local":
      return new LocalRouting(dataUrl());
    default:
      return undefined;
  }
}

expose(createPlannerApi(fetchJson, createRouting()));
