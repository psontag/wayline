import {
  type BBox,
  distanceKm,
  type FailedLimit,
  type GenerateProgress,
  type GenerateRequest,
  type GenerateResult,
  type Places,
  type Proposal,
} from "@wayline/domain";
import type {
  AbortSignalLike,
  RouteNetworkSource,
  RoutingProvider,
} from "@wayline/providers";
import { AreaCache, bboxAround } from "../graph/area";
import { Graph, type PathStep } from "../graph/Graph";
import { routeTrip, stageWaypoints } from "./route";
import {
  acceptable,
  type Candidate,
  chainPath,
  Costs,
  loopCandidates,
  oneWayCandidates,
  pathKm,
  VARIETY_PENALTY,
} from "./search";
import { cutStages, pathPoints, type Stop, stopCandidates } from "./stages";
import { Stops } from "./stops";
import { buildTrip, meanScore, routeNames, splitSteps, viaNames } from "./trip";

/** Proposals to look for. */
const PROPOSALS = 5;
/** Candidates to try before giving up. */
const MAX_TRIES = 300;
/** Search time limit in ms. Stops early once at least one proposal fits. */
const TIME_LIMIT_MS = 2000;
/** Max share of a proposal on edges of earlier proposals. */
const MAX_SHARED = 0.4;
/** Via nodes of two proposals must be at least this far apart. */
const MIN_VIA_GAP_KM = 10;
/** Max distance from the requested start to its station node. */
const START_KM = 5;

export type PlannerOptions = {
  onProgress?: (progress: GenerateProgress) => void;
  /** Called for each proposal as soon as it is ready. */
  onProposal?: (proposal: Proposal) => void;
  /** Checked between steps. Aborting rejects with an AbortError. */
  signal?: AbortSignalLike;
  /**
   * Routes the chosen proposals (step 7). Without it, stages keep the
   * graph path. If routing fails, the proposal keeps the graph path too.
   */
  routing?: RoutingProvider;
  /** Clock, for tests. */
  now?: () => Date;
};

type Pick = {
  nodes: number[];
  steps: PathStep[];
  stops: Stop[];
  km: number;
  shared: number;
};

/** Generates trip proposals on the route network. See docs/05. */
export class Planner {
  private stops: Stops;
  private runs = 0;

  constructor(
    readonly graph: Graph,
    places: Places,
  ) {
    this.stops = new Stops(graph, places);
  }

  async generate(
    request: GenerateRequest,
    options: PlannerOptions = {},
  ): Promise<GenerateResult> {
    const { onProgress, onProposal, signal } = options;
    const now = options.now?.() ?? new Date();
    const runId = `${now.getTime().toString(36)}-${++this.runs}`;
    const check = () => {
      if (signal?.aborted) throw abortError();
    };
    check();

    const graph = this.graph;
    const totalKm = request.days * request.kmPerDay;
    const costs = new Costs(graph, request.profile, request.region);
    const start = this.startNode(request);
    if (start === undefined) return { ok: false, failedLimit: "area" };
    const endStation = this.endNode(request);
    if (endStation === null || endStation === start) {
      return { ok: false, failedLimit: "area" };
    }

    onProgress?.({ phase: "searching", done: 0, total: MAX_TRIES });
    const vias = this.stops.townNodes();
    const candidates =
      request.kind === "one-way"
        ? oneWayCandidates(
            graph,
            costs,
            start,
            endStation === undefined
              ? this.stops.stationNodes().filter((n) => n !== start)
              : [endStation],
            vias,
            totalKm,
            endStation === undefined ? undefined : 0,
          )
        : loopCandidates(graph, costs, start, vias, totalKm);
    if (!candidates.length) {
      return { ok: false, failedLimit: request.region ? "area" : "days" };
    }

    const { picks, failedLimit } = this.pick(
      candidates,
      costs,
      request,
      totalKm,
      (done) => {
        check();
        onProgress?.({ phase: "searching", done, total: MAX_TRIES });
      },
    );
    if (!picks.length) return { ok: false, failedLimit };
    // Stages are cut during the search, since a path only counts if it cuts.
    onProgress?.({ phase: "cutting", done: picks.length, total: picks.length });

    const proposals: Proposal[] = [];
    for (const [i, p] of picks.entries()) {
      check();
      onProgress?.({ phase: "routing", done: i, total: picks.length });
      const end = p.nodes.at(-1) ?? start;
      let trip = buildTrip(graph, this.stops, {
        id: `draft-${runId}-${i + 1}`,
        now,
        request,
        start: this.stops.station(start),
        end: this.stops.station(end),
        steps: p.steps,
        stops: p.stops,
      });
      if (options.routing) {
        const waypoints = stageWaypoints(
          graph,
          trip,
          splitSteps(p.steps, p.stops),
        );
        try {
          trip = await routeTrip(
            trip,
            waypoints,
            options.routing,
            request,
            signal,
          );
        } catch {
          check();
        }
      }
      const proposal: Proposal = {
        id: `${runId}-${i + 1}`,
        trip,
        score: score(graph, p, totalKm),
        routeNames: routeNames(graph, p.steps),
        via: viaNames(graph, this.stops, start, p.steps, [
          trip.stages[0]?.start.name ?? "",
          trip.stages.at(-1)?.end.name ?? "",
        ]),
      };
      proposals.push(proposal);
      onProposal?.(proposal);
    }
    onProgress?.({ phase: "routing", done: picks.length, total: picks.length });
    return { ok: true, proposals };
  }

  /** Start station: the requested one, else the one nearest the region center. */
  private startNode(request: GenerateRequest): number | undefined {
    const isStation = (n: { kind: string }) => n.kind === "station";
    if (request.startStation) {
      return this.graph.nearestNode(request.startStation.coord, {
        maxKm: START_KM,
        filter: isStation,
      });
    }
    const r = request.region;
    if (!r) return undefined;
    const node = this.graph.nearestNode(
      [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2],
      {
        maxKm: Infinity,
        filter: (n) =>
          isStation(n) &&
          n.lon >= r[0] &&
          n.lon <= r[2] &&
          n.lat >= r[1] &&
          n.lat <= r[3],
      },
    );
    return node;
  }

  /**
   * End station of a one-way trip. Undefined lets the planner pick it,
   * null means the requested one is not on the network.
   */
  private endNode(request: GenerateRequest): number | null | undefined {
    if (request.kind !== "one-way" || !request.endStation) return undefined;
    return (
      this.graph.nearestNode(request.endStation.coord, {
        maxKm: START_KM,
        filter: (n) => n.kind === "station",
      }) ?? null
    );
  }

  /**
   * Tries candidates best first. Each kept path raises the cost of its
   * edges for later ones (penalty method), so proposals differ.
   */
  private pick(
    candidates: Candidate[],
    costs: Costs,
    request: GenerateRequest,
    totalKm: number,
    progress: (tries: number) => void,
  ): { picks: Pick[]; failedLimit: FailedLimit } {
    const graph = this.graph;
    const startedAt = Date.now();
    const used = new Set<number>();
    const picks: Pick[] = [];
    const tried = new Set<Candidate>();
    const hotelNodes = this.stops.hotelNodes();
    const hotelCount = cache((n: number) =>
      this.stops.hotelCount(n, request.hotelBudget),
    );
    const fails = { length: 0, hotels: 0, ascent: 0 };
    const isLoop = request.kind === "multi-day-loop";

    // One-way trips first look for different ends, then allow repeats.
    const passes = isLoop
      ? [(n: number[]) => n.slice(1, -1)]
      : [(n: number[]) => n.slice(1), (n: number[]) => n.slice(1, -1)];
    for (const keyNodes of passes) {
      for (const c of candidates) {
        if (picks.length === PROPOSALS || tried.size === MAX_TRIES) break;
        if (picks.length && Date.now() - startedAt > TIME_LIMIT_MS) break;
        if (tried.has(c)) continue;
        const mine = keyNodes(c.nodes);
        const close = picks.some((p) =>
          keyNodes(p.nodes).some((v) =>
            mine.some(
              (w) =>
                distanceKm(graph.coord(v), graph.coord(w)) < MIN_VIA_GAP_KM,
            ),
          ),
        );
        if (close) continue;

        tried.add(c);
        if (tried.size % 10 === 0) progress(tried.size);
        const steps = chainPath(graph, c.nodes, costs);
        if (!steps || !acceptable(graph, steps, totalKm)) {
          fails.length++;
          continue;
        }
        const km = pathKm(graph, steps);
        const edges = new Set(steps.map((s) => s.edge));
        let sharedKm = 0;
        for (const e of edges)
          if (used.has(e)) sharedKm += graph.edge(e).lengthKm;
        if (sharedKm > MAX_SHARED * km) continue;

        const points = pathPoints(graph, c.nodes[0] ?? 0, steps);
        const towns = stopCandidates(graph, points, hotelNodes, hotelCount);
        const stops = cutStages(points, towns, request);
        if (!stops) {
          // Tell a missing town apart from too much climbing.
          const flat = { ...request, maxAscentPerDay: Infinity };
          if (cutStages(points, towns, flat)) fails.ascent++;
          else fails.hotels++;
          continue;
        }

        picks.push({ nodes: c.nodes, steps, stops, km, shared: sharedKm / km });
        for (const e of edges) {
          used.add(e);
          costs.penalty[e] = (costs.penalty[e] ?? 1) * VARIETY_PENALTY;
        }
      }
    }
    progress(tried.size);

    const failedLimit: FailedLimit =
      fails.ascent > 0 && fails.ascent >= fails.hotels
        ? "maxAscentPerDay"
        : fails.hotels > 0
          ? "hotels"
          : request.region
            ? "area"
            : "days";
    return { picks, failedLimit };
  }
}

/** Loads the whole network and places of a small, untiled source. */
export async function loadPlanner(
  source: RouteNetworkSource,
): Promise<Planner> {
  const [network, places] = await Promise.all([
    source.network(),
    source.places(),
  ]);
  return new Planner(new Graph(network), places);
}

/** Planners for the area of each request. Loads only the tiles it needs. */
export class Planners {
  private areas: AreaCache<Planner>;

  constructor(source: RouteNetworkSource) {
    this.areas = new AreaCache(
      source,
      (network, places) => new Planner(new Graph(network), places),
    );
  }

  for(request: GenerateRequest): Promise<Planner> {
    return this.areas.get(requestBBox(request));
  }
}

/** Longest search radius around the start, in km. */
const MAX_RADIUS_KM = 200;

/** The area a request can reach. */
export function requestBBox(request: GenerateRequest): BBox {
  const totalKm = request.days * request.kmPerDay;
  const points = [request.startStation, request.endStation].flatMap((p) =>
    p ? [p.coord] : [],
  );
  if (request.region) {
    const [w, s, e, n] = request.region;
    return bboxAround([[w, s], [e, n], ...points], 20);
  }
  // Loop stops are at most about half the length from the start. One-way
  // ends without a chosen end are up to the full length away.
  const radius =
    request.kind === "multi-day-loop" || request.endStation
      ? totalKm / 2
      : totalKm;
  return bboxAround(points, Math.min(radius, MAX_RADIUS_KM));
}

/**
 * Higher is better. Nice edges, length close to the target, even stages
 * and little overlap with earlier proposals.
 */
function score(graph: Graph, p: Pick, totalKm: number): number {
  const lengthFit = 1 - Math.abs(p.km - totalKm) / totalKm;
  return (
    Math.round(
      meanScore(graph, p.steps) * lengthFit * (1 - 0.5 * p.shared) * 1000,
    ) / 1000
  );
}

function abortError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

function cache<T>(fn: (n: number) => T): (n: number) => T {
  const map = new Map<number, T>();
  return (n) => {
    let v = map.get(n);
    if (v === undefined) {
      v = fn(n);
      map.set(n, v);
    }
    return v;
  };
}
