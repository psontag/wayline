import type {
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  Proposal,
} from "@wayline/domain";
import { loadPlanner, type Planner } from "@wayline/planner";
import { type FetchJson, MockNetworkSource } from "@wayline/providers";

/** What the generator worker exposes. */
export type PlannerApi = {
  generate(
    request: GenerateRequest,
    dataUrl: string,
    onProgress?: (progress: GenerateProgress) => unknown,
    onProposal?: (proposal: Proposal) => unknown,
  ): Promise<GenerateResult>;
};

/** Planner API that loads the network once per data URL. */
export function createPlannerApi(fetchJson: FetchJson): PlannerApi {
  const planners = new Map<string, Promise<Planner>>();
  return {
    async generate(request, dataUrl, onProgress, onProposal) {
      // Callbacks may be async (comlink). Wait for all of them before the
      // result, so no proposal arrives after it.
      const pending: unknown[] = [];
      let planner = planners.get(dataUrl);
      if (!planner) {
        pending.push(onProgress?.({ phase: "loading", done: 0, total: 0 }));
        planner = loadPlanner(new MockNetworkSource(fetchJson, dataUrl));
        planner.catch(() => planners.delete(dataUrl));
        planners.set(dataUrl, planner);
      }
      const result = await (
        await planner
      ).generate(request, {
        onProgress: (p) => pending.push(onProgress?.(p)),
        onProposal: (p) => pending.push(onProposal?.(p)),
      });
      await Promise.all(pending);
      return result;
    },
  };
}
