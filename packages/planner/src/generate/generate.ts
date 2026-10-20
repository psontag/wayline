import {
  type BBox,
  distanceKm,
  type FailedLimit,
  type GenerateProgress,
  type GenerateRequest,
  type GenerateResult,
  type LonLat,
  type Place,
  type Places,
  type Proposal,
  Theme,
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
  type Avoid,
  type Candidate,
  chainPath,
  Costs,
  loopCandidates,
  oneWayCandidates,
  pathKm,
  VARIETY_PENALTY,
} from "./search";
import {
  cutStages,
  type PathPoint,
  pathPoints,
  type Stop,
  stopCandidates,
} from "./stages";
import { Stops } from "./stops";
import { themeFit, themeValue } from "./theme";
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
/** A start or end within this distance of a station uses the station. */
const STATION_KM = 2;
/** Max distance from the requested start or end to the network. */
const START_KM = 5;
/** A one-day proposal sharing more of the direct path is no proposal. */
const MAX_SHARED_DIRECT = 0.6;
/** "Longer" one-day proposals are this much longer than the direct one. */
const LONGER = { min: 1.2, max: 1.4 };
/** The middle leg of a loop avoids edges this close to the start. */
const LOOP_AVOID = { share: 0.08, minKm: 5, factor: 8 };
/** The middle of a loop must not come closer to the start than this. */
const LOOP_GAP = { share: 0.04, minKm: 4 };
/**
 * Parts of a path within gapKm of an earlier part more than afterKm back
 * may add up to maxShare of the length (at least minKm).
 */
const SPUR = { gapKm: 1.5, afterKm: 10, maxShare: 0.04, minKm: 4 };

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
    const costs = new Costs(graph, request);
    const start = this.startNode(request);
    if (start === undefined) return { ok: false, failedLimit: "area" };
    const endStation = this.endNode(request);
    if (endStation === null || endStation === start) {
      return { ok: false, failedLimit: "area" };
    }

    // One day from A to B: the direct path first, then longer ones.
    let totalKm = targetKm(request);
    let direct: Pick | undefined;
    if (request.kind === "one-way" && request.days === 1 && endStation) {
      const steps = chainPath(graph, [start, endStation], costs);
      if (steps) {
        const km = pathKm(graph, steps);
        direct = {
          nodes: [start, endStation],
          steps,
          stops: [],
          km,
          shared: 0,
        };
        totalKm = Math.min(totalKm, LONGER.max * km);
        if (totalKm < LONGER.min * km) totalKm = 1.1 * km;
        for (const s of steps) {
          costs.penalty[s.edge] =
            (costs.penalty[s.edge] ?? 1) * VARIETY_PENALTY;
        }
      }
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
    if (!candidates.length && !direct) {
      return { ok: false, failedLimit: request.region ? "area" : "days" };
    }

    const found = this.pick(candidates, costs, request, totalKm, (done) => {
      check();
      onProgress?.({ phase: "searching", done, total: MAX_TRIES });
    });
    const picks = direct
      ? [
          direct,
          ...found.picks.filter(
            (p) => sharedKm(graph, p, direct) < MAX_SHARED_DIRECT * p.km,
          ),
        ].slice(0, PROPOSALS)
      : found.picks;
    if (!picks.length) return { ok: false, failedLimit: found.failedLimit };
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
        start: this.endpoint(start, request.startStation),
        end: this.endpoint(
          end,
          request.kind === "one-way"
            ? request.endStation
            : request.startStation,
        ),
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
        score: score(graph, p, totalKm, request),
        routeNames: routeNames(graph, p.steps),
        via: viaNames(graph, this.stops, start, p.steps, [
          trip.stages[0]?.start.name ?? "",
          trip.stages.at(-1)?.end.name ?? "",
        ]),
      };
      if (direct) {
        proposal.character =
          p === direct
            ? "direct"
            : p.km >= LONGER.min * direct.km * 0.95
              ? "longer"
              : "scenic";
      }
      if (request.kind === "day-loop" && proposal.via[0]) {
        const home = trip.stages[0]?.start.name ?? "";
        trip.name = `${home} – ${proposal.via[0]} – ${home}`;
      }
      if (p.steps.some((s) => graph.edge(s.edge).scenery)) {
        proposal.themes = Object.fromEntries(
          Theme.options.map((t) => [t, themeValue(graph, p.steps, t)]),
        );
      }
      proposals.push(proposal);
      onProposal?.(proposal);
    }
    onProgress?.({ phase: "routing", done: picks.length, total: picks.length });
    return { ok: true, proposals };
  }

  /**
   * Start node: a station near the requested place, else the network near
   * it. Without a place, the station nearest the region center.
   */
  private startNode(request: GenerateRequest): number | undefined {
    const isStation = (n: { kind: string }) => n.kind === "station";
    if (request.startStation) return this.nodeAt(request.startStation.coord);
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
   * End node of a one-way trip. Undefined lets the planner pick a station,
   * null means the requested place is not on the network.
   */
  private endNode(request: GenerateRequest): number | null | undefined {
    if (request.kind !== "one-way" || !request.endStation) return undefined;
    return this.nodeAt(request.endStation.coord) ?? null;
  }

  private nodeAt(coord: LonLat): number | undefined {
    return (
      this.graph.nearestNode(coord, {
        maxKm: STATION_KM,
        filter: (n) => n.kind === "station",
      }) ?? this.graph.nearestNode(coord, { maxKm: START_KM })
    );
  }

  /** The station at a node, else the requested place. */
  private endpoint(node: number, requested?: Place): Place {
    if (this.graph.node(node).kind === "station" || !requested) {
      return this.stops.station(node);
    }
    return requested;
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
    const isLoop = request.kind !== "one-way";
    const startNode = candidates[0]?.nodes[0];
    const home = startNode === undefined ? undefined : graph.coord(startNode);
    const avoid =
      isLoop && startNode !== undefined
        ? nearEdges(graph, startNode, totalKm)
        : undefined;

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
        const steps = chainPath(graph, c.nodes, costs, avoid);
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
        if (
          (isLoop && comesBack(graph, points, totalKm)) ||
          doublesBack(graph, points, isLoop)
        ) {
          fails.length++;
          continue;
        }
        const towns = stopCandidates(graph, points, hotelNodes, hotelCount);
        const cut = { ...request, home: isLoop ? home : undefined };
        const stops = cutStages(points, towns, cut);
        if (!stops) {
          // Tell a missing town apart from too much climbing.
          const flat = { ...cut, maxAscentPerDay: Infinity };
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

/** Edges near the start, for the middle leg of a loop to avoid. */
function nearEdges(graph: Graph, start: number, totalKm: number): Avoid {
  const km = Math.max(LOOP_AVOID.minKm, LOOP_AVOID.share * totalKm);
  const edges = new Set<number>();
  for (const n of graph.nodesWithin(graph.coord(start), km))
    for (const e of graph.edgesAt(n)) edges.add(e);
  return { legs: [1], edges, factor: LOOP_AVOID.factor };
}

/** Does the middle of a loop come back close to the start? */
function comesBack(graph: Graph, points: PathPoint[], totalKm: number) {
  const home = graph.coord(points[0]?.node ?? 0);
  const total = points.at(-1)?.km ?? 0;
  const gap = Math.max(LOOP_GAP.minKm, LOOP_GAP.share * totalKm);
  return points.some(
    (p) =>
      p.km > 0.2 * total &&
      p.km < 0.8 * total &&
      distanceKm(home, graph.coord(p.node)) < gap,
  );
}

/**
 * Does the path ride back along itself, like a spur out and back on a
 * parallel road? A short touch, like a river bend, is fine. Loops may meet
 * themselves at the start.
 */
export function doublesBack(
  graph: Graph,
  points: PathPoint[],
  isLoop: boolean,
): boolean {
  const total = points.at(-1)?.km ?? 0;
  const limit = Math.max(SPUR.minKm, SPUR.maxShare * total);
  const atEnds = (km: number) => km < 0.1 * total || km > 0.9 * total;
  // Grid of earlier points, with cells about gapKm wide.
  const cell = SPUR.gapKm / 75;
  const key = (x: number, y: number) => `${x},${y}`;
  const grid = new Map<string, { coord: LonLat; km: number }[]>();
  let doubled = 0;
  let prevKm = 0;
  for (const p of points) {
    const coord = graph.coord(p.node);
    const cx = Math.floor(coord[0] / cell);
    const cy = Math.floor(coord[1] / cell);
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) {
      for (let dy = -1; dy <= 1 && !near; dy++) {
        near = (grid.get(key(cx + dx, cy + dy)) ?? []).some(
          (a) =>
            p.km - a.km > SPUR.afterKm &&
            !(isLoop && atEnds(a.km) && atEnds(p.km)) &&
            distanceKm(a.coord, coord) < SPUR.gapKm,
        );
      }
    }
    if (near) doubled += p.km - prevKm;
    if (doubled > limit) return true;
    prevKm = p.km;
    const list = grid.get(key(cx, cy)) ?? [];
    list.push({ coord, km: p.km });
    grid.set(key(cx, cy), list);
  }
  return false;
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

/** Length the request aims for: km per day times the day shares. */
export function targetKm(request: GenerateRequest): number {
  const shares = request.dayShares ?? [];
  let days = 0;
  for (let i = 0; i < request.days; i++) days += shares[i] ?? 1;
  return days * request.kmPerDay;
}

/** km of a path on the edges of another. */
function sharedKm(graph: Graph, a: Pick, b: Pick): number {
  const edges = new Set(b.steps.map((s) => s.edge));
  let km = 0;
  for (const s of a.steps)
    if (edges.has(s.edge)) km += graph.edge(s.edge).lengthKm;
  return km;
}

/** Longest search radius around the start, in km. */
const MAX_RADIUS_KM = 200;

/** The area a request can reach. */
export function requestBBox(request: GenerateRequest): BBox {
  const totalKm = targetKm(request);
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
    request.kind !== "one-way" || request.endStation ? totalKm / 2 : totalKm;
  return bboxAround(points, Math.min(radius, MAX_RADIUS_KM));
}

/**
 * Higher is better. Nice edges, length close to the target, little overlap
 * with earlier proposals and, with a theme, much of it.
 */
function score(
  graph: Graph,
  p: Pick,
  totalKm: number,
  request: GenerateRequest,
): number {
  const lengthFit = 1 - Math.abs(p.km - totalKm) / totalKm;
  const theme = request.theme
    ? 0.5 + 0.5 * themeFit(graph, p.steps, request.theme)
    : 1;
  return (
    Math.round(
      meanScore(graph, p.steps) *
        lengthFit *
        (1 - 0.5 * p.shared) *
        theme *
        1000,
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
