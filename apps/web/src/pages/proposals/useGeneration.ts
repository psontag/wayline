import type {
  FailedLimit,
  GenerateProgress,
  GenerateRequest,
  HourlyWind,
  Proposal,
} from "@wayline/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServices } from "../../data/ServicesProvider";

export type Generation = {
  status: "running" | "done" | "failed" | "cancelled" | "error";
  progress?: GenerateProgress;
  /** The network was loaded, in this run or before. */
  loaded: boolean;
  /** Paths tried so far. */
  searched: number;
  proposals: Proposal[];
  failedLimit?: FailedLimit;
};

const start: Generation = {
  status: "running",
  loaded: false,
  searched: 0,
  proposals: [],
};

// Finished runs by request, so going back from the editor shows the same
// proposals instead of new ones.
const finished = new Map<string, Generation>();
const MAX_FINISHED = 10;

/**
 * Runs the trip generator for a request. Proposals come in one by one.
 * wind: hourly wind to plan with. Null waits for it.
 */
export function useGeneration(
  request: GenerateRequest | undefined,
  wind?: HourlyWind[] | null,
) {
  const { generator } = useServices();
  const key =
    request && wind !== null
      ? JSON.stringify({ request, wind: wind?.length ? wind : undefined })
      : undefined;
  const [run, setRun] = useState(0);
  // State of the run with this id. Another id means a new run.
  const id = `${run}:${key}`;
  const [state, setState] = useState<{ id: string; generation: Generation }>();
  const controller = useRef<AbortController>(undefined);

  useEffect(() => {
    if (!key || finished.has(key)) return;
    const ac = new AbortController();
    controller.current = ac;
    let active = true;
    const update = (fn: (s: Generation) => Generation) => {
      if (!active) return;
      setState((prev) => ({
        id,
        generation: fn(prev?.id === id ? prev.generation : start),
      }));
    };
    // Start on the next task: React's strict mode mounts twice, and a
    // second run would restart the worker.
    const timer = setTimeout(() => {
      const run = JSON.parse(key) as {
        request: GenerateRequest;
        wind?: HourlyWind[];
      };
      generator
        .generate(run.request, {
          signal: ac.signal,
          ...(run.wind ? { wind: run.wind } : {}),
          onProgress: (progress) =>
            update((s) => ({
              ...s,
              progress,
              loaded: s.loaded || progress.phase !== "loading",
              searched:
                progress.phase === "searching" ? progress.done : s.searched,
            })),
          onProposal: (proposal) =>
            update((s) => ({ ...s, proposals: [...s.proposals, proposal] })),
        })
        .then(
          (result) =>
            update((s) => {
              const next: Generation = result.ok
                ? { ...s, status: "done", proposals: result.proposals }
                : { ...s, status: "failed", failedLimit: result.failedLimit };
              remember(key, next);
              return next;
            }),
          (error: unknown) =>
            update((s) => ({
              ...s,
              status: isAbort(error) ? "cancelled" : "error",
            })),
        );
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
      ac.abort();
    };
  }, [generator, key, id]);

  const cancel = useCallback(() => controller.current?.abort(), []);

  const retry = useCallback(() => {
    if (key) finished.delete(key);
    setRun((n) => n + 1);
  }, [key]);

  const generation =
    state?.id === id ? state.generation : (key && finished.get(key)) || start;
  return { ...generation, cancel, retry };
}

function remember(key: string, generation: Generation) {
  finished.delete(key);
  finished.set(key, generation);
  const oldest = finished.keys().next().value;
  if (finished.size > MAX_FINISHED && oldest) finished.delete(oldest);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
