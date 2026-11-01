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
};

/**
 * Planner API. Keeps the loaded network per data URL and area. Without
 * routing, proposals keep the graph path.
 */
export function createPlannerApi(
  fetchJson: FetchJson,
  routing?: RoutingProvider,
): PlannerApi {
  const sources = new Map<string, Planners>();
  return {
    async generate(request, dataUrl, onProgress, onProposal, wind) {
      // Callbacks may be async (comlink). Wait for all of them before the
      // result, so no proposal arrives after it.
      const pending: unknown[] = [];
      pending.push(onProgress?.({ phase: "loading", done: 0, total: 0 }));
      let planners = sources.get(dataUrl);
      if (!planners) {
        planners = new Planners(await openSource(fetchJson, dataUrl));
        sources.set(dataUrl, planners);
      }
      const planner = await planners.for(request);
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
