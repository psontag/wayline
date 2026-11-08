import type {
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  HourlyWind,
  Proposal,
} from "@wayline/domain";
import { Planners } from "@wayline/planner";
import {
  type FetchJson,
  openSource,
  type RoutingProvider,
} from "@wayline/providers";

/** What the generator worker exposes. */
export type PlannerApi = {
  generate(
    request: GenerateRequest,
    dataUrl: string,
    onProgress?: (progress: GenerateProgress) => unknown,
    onProposal?: (proposal: Proposal) => unknown,
    wind?: HourlyWind[],
  ): Promise<GenerateResult>;
  /** Loads the network a request needs, so generate starts sooner. */
  prepare(request: GenerateRequest, dataUrl: string): Promise<void>;
};

/**
 * Planner API. Keeps the loaded network per data URL and area. Without
 * routing, proposals keep the graph path.
 */
export function createPlannerApi(
  fetchJson: FetchJson,
  routing?: RoutingProvider,
): PlannerApi {
  // Promises, so a prepare and a generate at the same time share one load.
  const sources = new Map<string, Promise<Planners>>();
  const plannerFor = async (request: GenerateRequest, dataUrl: string) => {
    let planners = sources.get(dataUrl);
    if (!planners) {
      planners = openSource(fetchJson, dataUrl).then((s) => new Planners(s));
      planners.catch(() => sources.delete(dataUrl));
      sources.set(dataUrl, planners);
    }
    return (await planners).for(request);
  };
  return {
    async prepare(request, dataUrl) {
      await plannerFor(request, dataUrl);
    },
    async generate(request, dataUrl, onProgress, onProposal, wind) {
      // Callbacks may be async (comlink). Wait for all of them before the
      // result, so no proposal arrives after it.
      const pending: unknown[] = [];
      pending.push(onProgress?.({ phase: "loading", done: 0, total: 0 }));
      const planner = await plannerFor(request, dataUrl);
      const result = await planner.generate(request, {
        onProgress: (p) => pending.push(onProgress?.(p)),
        onProposal: (p) => pending.push(onProposal?.(p)),
        ...(routing ? { routing } : {}),
        ...(wind ? { wind } : {}),
      });
      await Promise.all(pending);
      return result;
    },
  };
}
