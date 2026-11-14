import {
  byRank,
  type FailedLimit,
  type GenerateProgress,
  type GenerateRequest,
  type HourlyWind,
  type Proposal,
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
  /** With several requests: which one runs now. */
  run?: { index: number; count: number };
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

/** With more than one request, only this many proposals stay: the best. */
const MAX_KEPT = 3;

/** The best proposals of several runs, highest score first. */
export function bestOf(proposals: Proposal[]): Proposal[] {
  return [...proposals].sort((a, b) => b.score - a.score).slice(0, MAX_KEPT);
}

/**
 * Runs the trip generator for a request, then for each of `also`, one after
 * another. Proposals come in one by one. wind: hourly wind to plan with.
 * Null waits for it.
 */
export function useGeneration(
  request: GenerateRequest | undefined,
  wind?: HourlyWind[] | null,
  also: GenerateRequest[] = [],
) {
  const { generator } = useServices();
  const key =
    request && wind !== null
      ? JSON.stringify({
          requests: [request, ...also],
          wind: wind?.length ? wind : undefined,
        })
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
      const { requests, wind } = JSON.parse(key) as {
        requests: GenerateRequest[];
        wind?: HourlyWind[];
      };
      const many = requests.length > 1;
      // Ids are unique within a run only.
      const tag = (i: number, p: Proposal) =>
        many ? { ...p, id: `${i}-${p.id}` } : p;
      const merge = (old: Proposal[], found: Proposal[]) =>
        many ? bestOf([...old, ...found]) : found.sort(byRank);
      const runAll = async () => {
        let done: Proposal[] = [];
        let failedLimit: FailedLimit | undefined;
        let ok = false;
        for (const [i, request] of requests.entries()) {
          update((s) => ({ ...s, run: { index: i, count: requests.length } }));
          const result = await generator.generate(request, {
            signal: ac.signal,
            ...(wind ? { wind } : {}),
            onProgress: (progress) =>
              update((s) => ({
                ...s,
                progress,
                loaded: s.loaded || progress.phase !== "loading",
                searched:
                  progress.phase === "searching" ? progress.done : s.searched,
              })),
            // Proposals come as found. Rank keeps the list in its final order.
            onProposal: (proposal) =>
              update((s) => ({
                ...s,
                proposals: merge(s.proposals, [tag(i, proposal)]),
              })),
          });
          if (result.ok) {
            ok = true;
            done = merge(
              done,
              result.proposals.map((p) => tag(i, p)),
            );
          } else {
            failedLimit = result.failedLimit;
          }
          update((s) => ({ ...s, proposals: done }));
        }
        return { ok, done, failedLimit };
      };
      runAll().then(
        ({ ok, done, failedLimit }) =>
          update((s) => {
            const next: Generation = ok
              ? { ...s, status: "done", proposals: done }
              : {
                  ...s,
                  status: "failed",
                  ...(failedLimit && { failedLimit }),
                };
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
