import {
  byRank,
  type FailedLimit,
  type GenerateProgress,
  type GenerateRequest,
  type HourlyWind,
  type Proposal,
} from "@wayline/domain";
import type { MultiPolygon } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServices } from "../../data/ServicesProvider";
import { areaShare } from "./areaShare";

export type Generation = {
  status: "running" | "done" | "failed" | "cancelled" | "error";
  progress?: GenerateProgress;
  /** The network was loaded, in this run or before. */
  loaded: boolean;
  /** Paths tried so far. */
  searched: number;
  proposals: Proposal[];
  failedLimit?: FailedLimit;
  /** A to B: km of the best path from start to end, once found. */
  directKm?: number;
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

/**
 * The best proposals of several runs, highest score first. With inside,
 * the share of each route in the picked area, routes mostly in the area
 * come first, in steps of a quarter.
 */
export function bestOf(
  proposals: Proposal[],
  inside?: (p: Proposal) => number,
): Proposal[] {
  const band = (p: Proposal) => (inside ? Math.floor(inside(p) * 4) : 0);
  return [...proposals]
    .sort((a, b) => band(b) - band(a) || b.score - a.score)
    .slice(0, MAX_KEPT);
}

/** Adds found proposals to the shown ones. many: several requests. */
export function mergeProposals(
  old: Proposal[],
  found: Proposal[],
  many: boolean,
  inside?: (p: Proposal) => number,
): Proposal[] {
  const all = [...old, ...found];
  return many ? bestOf(all, inside) : all.sort(byRank);
}

/**
 * Runs the trip generator for a request, then for each of `also`, one after
 * another. Proposals come in one by one. wind: hourly wind to plan with.
 * Null waits for it. area: the picked area, to keep routes inside it first.
 */
export function useGeneration(
  request: GenerateRequest | undefined,
  wind?: HourlyWind[] | null,
  also: GenerateRequest[] = [],
  area?: MultiPolygon,
) {
  const { generator } = useServices();
  // Read when proposals come in: the area may load after the run started.
  const inside = useRef<(p: Proposal) => number>(undefined);
  useEffect(() => {
    if (!area) return;
    const shares = new Map<string, number>();
    inside.current = (p) => {
      let share = shares.get(p.id);
      if (share === undefined) {
        share = areaShare(p, area);
        shares.set(p.id, share);
      }
      return share;
    };
  }, [area]);
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
        mergeProposals(old, found, many, inside.current);
      const runAll = async () => {
        let done: Proposal[] = [];
        let failedLimit: FailedLimit | undefined;
        let ok = false;
        for (const [i, request] of requests.entries()) {
          update((s) => ({ ...s, run: { index: i, count: requests.length } }));
          // Only the best few of all runs stay, so each run stops sooner.
          const asked = many ? { ...request, maxProposals: MAX_KEPT } : request;
          const result = await generator.generate(asked, {
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
          let directKm: number | undefined;
          if (result.ok) {
            ok = true;
            directKm = many ? undefined : result.directKm;
            done = merge(
              done,
              result.proposals.map((p) => tag(i, p)),
            );
          } else {
            failedLimit = result.failedLimit;
          }
          update((s) => ({
            ...s,
            proposals: done,
            ...(directKm !== undefined && { directKm }),
          }));
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
