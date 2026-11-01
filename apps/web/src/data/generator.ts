import { proxy, type Remote, wrap } from "comlink";
import type { PlannerApi } from "./plannerApi";
import type { TripGenerator } from "./TripGenerator";

/** A running planner, usually a Web Worker. */
export type PlannerWorker = {
  api: Remote<PlannerApi>;
  terminate(): void;
};

export type GeneratorDeps = {
  /** Folder with manifest.json, e.g. /data/mock/oberfranken. */
  dataUrl: string | Promise<string>;
  /** Starts a planner. Tests pass one that runs in-process. */
  connect?: () => PlannerWorker;
};

function connectWorker(): PlannerWorker {
  const worker = new Worker(new URL("./generator.worker.ts", import.meta.url), {
    type: "module",
  });
  return { api: wrap<PlannerApi>(worker), terminate: () => worker.terminate() };
}

/**
 * Runs the planner in a Web Worker. The worker keeps the network loaded
 * between runs. Cancel stops the worker; the next run starts a new one.
 * A new run cancels the one still running.
 */
export function createTripGenerator({
  dataUrl,
  connect = connectWorker,
}: GeneratorDeps): TripGenerator {
  let worker: PlannerWorker | undefined;
  let cancelRunning: (() => void) | undefined;

  return {
    generate(request, { onProgress, onProposal, signal, wind } = {}) {
      cancelRunning?.();
      if (signal?.aborted) return Promise.reject(abortError());
      const w = (worker ??= connect());

      return new Promise((resolve, reject) => {
        const cancel = () => {
          done();
          w.terminate();
          if (worker === w) worker = undefined;
          reject(abortError());
        };
        const done = () => {
          signal?.removeEventListener("abort", cancel);
          if (cancelRunning === cancel) cancelRunning = undefined;
        };
        cancelRunning = cancel;
        signal?.addEventListener("abort", cancel);
        const run = async () =>
          w.api.generate(
            request,
            await dataUrl,
            onProgress && proxy(onProgress),
            onProposal && proxy(onProposal),
            wind,
          );
        run().then(
          (result) => {
            done();
            resolve(result);
          },
          (error: unknown) => {
            done();
            reject(error);
          },
        );
      });
    },
  };
}

function abortError(): Error {
  return new DOMException("Generation cancelled", "AbortError");
}
