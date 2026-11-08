// Times the proposal search on fixed trips and counts its work. Needs the
// built data. Run: pnpm bench. Options in docs/09-development.md.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TiledNetworkSource } from "@wayline/providers";
import { readDataFile } from "@wayline/providers/testing";
import { afterAll, describe, it } from "vitest";
import { Planners } from "../src/generate/generate";
import { resetSearchCounts, searchCounts } from "../src/graph/dijkstra";
import { fileRouting } from "./routing";
import { type BenchTrip, TRIPS } from "./trips";

const env = process.env;
const options = {
  only: env.BENCH_ONLY?.split(",").filter(Boolean) ?? [],
  runs: Math.max(1, Number(env.BENCH_RUNS ?? 3)),
  routing: env.BENCH_ROUTING !== "0",
  timeLimits: env.BENCH_TIME_LIMITS !== "0",
  data: env.BENCH_DATA,
  out: env.BENCH_OUT,
  base: env.BENCH_BASE,
};

export type TripResult = {
  name: string;
  proposals: number;
  /** ms, first run only: reading tiles and building the graph. */
  load: number;
  /** ms, median over runs. */
  total: number;
  first: number;
  steps: Record<string, number>;
  /** Of the last run. Exact without time limits. */
  counts: typeof searchCounts;
};
export type BenchResult = {
  data: string;
  options: Omit<typeof options, "out" | "base">;
  trips: TripResult[];
};

const root = new URL("../../../apps/web/public/data/", import.meta.url);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)] ?? 0;
};

async function dataVersion(): Promise<string> {
  if (options.data) return options.data;
  const latest = JSON.parse(
    await readFile(new URL("latest.json", root), "utf8"),
  );
  return latest.version as string;
}

async function runTrip(version: string, trip: BenchTrip): Promise<TripResult> {
  // New source and planners per trip: the first run loads like a new worker.
  const planners = new Planners(
    new TiledNetworkSource(readDataFile, `/data/${version}`),
  );
  const routing = options.routing
    ? await fileRouting(new URL(`${version}/`, root))
    : undefined;
  const loadStart = performance.now();
  const planner = await planners.for(trip.request);
  const load = performance.now() - loadStart;

  const totals: number[] = [];
  const firsts: number[] = [];
  const steps: Record<string, number[]> = {};
  let proposals = 0;
  for (let run = 0; run < options.runs; run++) {
    const profile: Record<string, number> = {};
    resetSearchCounts();
    const t = performance.now();
    let first = 0;
    const result = await planner.generate(trip.request, {
      profile,
      timeLimits: options.timeLimits,
      ...(routing ? { routing } : {}),
      onProposal: () => {
        first ||= performance.now() - t;
      },
    });
    totals.push(performance.now() - t);
    firsts.push(first);
    for (const [k, v] of Object.entries(profile)) (steps[k] ??= []).push(v);
    proposals = result.ok ? result.proposals.length : 0;
  }
  return {
    name: trip.name,
    proposals,
    load,
    total: median(totals),
    first: median(firsts),
    steps: Object.fromEntries(
      Object.entries(steps).map(([k, v]) => [k, median(v)]),
    ),
    counts: { ...searchCounts },
  };
}

const STEPS = ["signed", "pick", "destinations", "flavours", "fill", "finish"];

function table(results: TripResult[], before?: BenchResult): string {
  const old = new Map(before?.trips.map((t) => [t.name, t]));
  const ms = (n: number | undefined) =>
    n === undefined
      ? ""
      : n < 10_000
        ? n.toFixed(0)
        : `${(n / 1000).toFixed(1)}k`;
  const change = (now: number, was: number | undefined) =>
    was
      ? ` (${now >= was ? "+" : ""}${(((now - was) / was) * 100).toFixed(0)} %)`
      : "";
  const head = [
    "Trip",
    "Props",
    "Load",
    ...STEPS,
    "Total ms",
    "1-to-all",
    "To target",
    "Settled M",
  ];
  const rows = results.map((r) => {
    const o = old.get(r.name);
    return [
      r.name,
      `${r.proposals}${o && o.proposals !== r.proposals ? ` (was ${o.proposals})` : ""}`,
      ms(r.load),
      ...STEPS.map((s) => ms(r.steps[s])),
      ms(r.total) + change(r.total, o?.total),
      String(r.counts.oneToAll) + change(r.counts.oneToAll, o?.counts.oneToAll),
      String(r.counts.toTarget),
      (r.counts.settled / 1e6).toFixed(1) +
        change(r.counts.settled, o?.counts.settled),
    ];
  });
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

const results: TripResult[] = [];
let data = "";

describe("search", () => {
  const trips = TRIPS.filter(
    (t) => !options.only.length || options.only.some((o) => t.name.includes(o)),
  );
  for (const trip of trips) {
    it(trip.name, async () => {
      data ||= await dataVersion();
      results.push(await runTrip(data, trip));
    });
  }

  afterAll(async () => {
    const before = options.base
      ? (JSON.parse(
          await readFile(resolve(options.base), "utf8"),
        ) as BenchResult)
      : undefined;
    const { only, runs, routing, timeLimits } = options;
    const rest = { only, runs, routing, timeLimits, data: options.data };
    console.log(
      `\nData ${data}. ${options.runs} runs, routing ${options.routing ? "on" : "off"}, time limits ${options.timeLimits ? "on" : "off"}.${before ? ` Compared to ${options.base}.` : ""}\n`,
    );
    console.log(table(results, before));
    if (options.out) {
      const result: BenchResult = { data, options: rest, trips: results };
      await writeFile(resolve(options.out), JSON.stringify(result, null, 2));
      console.log(`\nWrote ${options.out}`);
    }
  });
});
