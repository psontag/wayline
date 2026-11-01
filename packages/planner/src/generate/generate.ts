import {
  type BBox,
  bearing,
  distanceKm,
  type FailedLimit,
  type Flavour,
  type GenerateProgress,
  type GenerateRequest,
  type GenerateResult,
  type HourlyWind,
  type LonLat,
  type Place,
  type Places,
  type Proposal,
  Theme,
  timeToHours,
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
import { flavourValue, themeFit, themeValue } from "./theme";
import { buildTrip, meanScore, routeNames, splitSteps, viaNames } from "./trip";
import { type Ride, windFactor, windRanked } from "./wind";

/** Proposals to look for on a one-day A to B trip. */
const PROPOSALS = 5;
/** Candidates to try before giving up. */
const MAX_TRIES = 300;
/** Search time limit in ms. Stops early once at least one proposal fits. */
const TIME_LIMIT_MS = 2000;
/** Max share of a proposal on edges of earlier proposals. */
const MAX_SHARED = 0.4;
/** Candidates to try per flavour, once some flavour has a proposal. */
const FLAVOUR_TRIES = 60;
/** Search time per flavour in ms, once some flavour has a proposal. */
const FLAVOUR_TIME_MS = 1500;
/**
 * A scenery flavour must have at least the min share and this much more
 * than the best proposal.
 */
const MIN_SCENERY = {
  nature: { gain: 0.08, min: 0.5 },
  sights: { gain: 0.05, min: 0.2 },
};
/** Flat climbs at most this share of best. */
const FLAT_SHARE = 0.85;
/** Hilly climbs at least this many times as much as best. */
const HILLY_GAIN = 1.5;
/** Hilly aims for this share of the max ascent. */
const HILLY_TARGET = 0.65;
/** The flavour of the theme picked in the form goes first. */
const THEME_FLAVOUR: Record<Theme, Flavour> = {
  nature: "nature",
  water: "nature",
  wine: "sights",
  culture: "sights",
};
/** Open day ride: ends of two proposals this far apart, seen from the start. */
const MIN_TURN_DEG = 45;
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
  /** Hourly wind of the start date. Day trips then plan with it. */
  wind?: HourlyWind[];
};

type Pick = {
  nodes: number[];
  steps: PathStep[];
  stops: Stop[];
  km: number;
  /** Meters. */
  ascent: number;
  shared: number;
  flavour?: Flavour;
  homeward?: boolean;
};

/** What the checks on a candidate path need. */
type Check = {
  request: GenerateRequest;
  totalKm: number;
  isLoop: boolean;
  home?: LonLat;
  avoid?: Avoid;
  hotelNodes: number[];
  hotelCount: (node: number) => number;
  fails: { length: number; hotels: number; ascent: number };
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
          ascent: pathAscent(graph, start, steps),
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
    // Open day ride: any direction, back by train.
    const open =
      request.kind === "one-way" &&
      request.days === 1 &&
      endStation === undefined;
    const ride: Ride | undefined =
      options.wind?.length && (open || request.kind === "day-loop")
        ? { wind: options.wind, startHour: timeToHours(request.startTime) }
        : undefined;
    const candidates = (c: Costs) => {
      const list =
        request.kind === "one-way"
          ? oneWayCandidates(
              graph,
              c,
              start,
              endStation === undefined
                ? this.stops.stationNodes().filter((n) => n !== start)
                : [endStation],
              vias,
              totalKm,
              endStation === undefined ? undefined : 0,
            )
          : loopCandidates(graph, c, start, vias, totalKm);
      return ride ? windRanked(graph, list, totalKm, ride, open) : list;
    };
    const progress = (done: number) => {
      check();
      onProgress?.({ phase: "searching", done, total: MAX_TRIES });
    };

    // One-day A to B keeps its characters. Other trips get one per flavour.
    let found: { picks: Pick[]; failedLimit: FailedLimit };
    let picks: Pick[];
    if (direct) {
      found = this.pick(candidates(costs), costs, request, totalKm, progress);
      picks = [
        direct,
        ...found.picks.filter(
          (p) => sharedKm(graph, p, direct) < MAX_SHARED_DIRECT * p.km,
        ),
      ].slice(0, PROPOSALS);
    } else if (open) {
      found = this.pickDestinations(
        candidates(costs),
        costs,
        request,
        totalKm,
        progress,
      );
      picks = found.picks;
      // Rides with the wind first. Close factors keep the search order.
      if (ride) {
        const wind = (p: Pick) =>
          Math.round(
            windFactor(
              p.nodes.map((n) => graph.coord(n)),
              totalKm,
              ride,
            ) * 10,
          );
        picks.sort((a, b) => wind(a) - wind(b));
      }
    } else {
      found = this.pickFlavours(candidates, request, totalKm, progress);
      picks = found.picks;
    }
    if (!picks.length) return { ok: false, failedLimit: found.failedLimit };
    // Stages are cut during the search, since a path only counts if it cuts.
    onProgress?.({ phase: "cutting", done: picks.length, total: picks.length });

    const proposals: Proposal[] = [];
    for (const [i, p] of picks.entries()) {
      check();
      onProgress?.({ phase: "routing", done: i, total: picks.length });
      const placeAt = (node: number) =>
        this.endpoint(
          node,
          node === start ? request.startStation : request.endStation,
        );
      const from = p.nodes[0] ?? start;
      let trip = buildTrip(graph, this.stops, {
        id: `draft-${runId}-${i + 1}`,
        now,
        request,
        start: placeAt(from),
        end: placeAt(p.nodes.at(-1) ?? start),
        steps: p.steps,
        stops: p.stops,
      });
      if (p.homeward) {
        trip.name = `${trip.stages[0]?.start.name ?? ""} – ${request.startStation?.name ?? trip.stages.at(-1)?.end.name ?? ""}`;
      }
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
        signedShare: signedShare(graph, p.steps),
        routeNames: routeNames(graph, p.steps),
        via: viaNames(graph, this.stops, from, p.steps, [
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
      if (p.flavour) proposal.flavour = p.flavour;
      if (p.homeward) proposal.homeward = true;
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

  /** Shared setup for checking candidate paths. */
  private checker(
    candidates: Candidate[],
    request: GenerateRequest,
    totalKm: number,
  ): Check {
    const isLoop = request.kind !== "one-way";
    const startNode = candidates[0]?.nodes[0];
    return {
      request,
      totalKm,
      isLoop,
      home: startNode === undefined ? undefined : this.graph.coord(startNode),
      avoid:
        isLoop && startNode !== undefined
          ? nearEdges(this.graph, startNode, totalKm)
          : undefined,
      hotelNodes: this.stops.hotelNodes(),
      hotelCount: cache((n: number) =>
        this.stops.hotelCount(n, request.hotelBudget),
      ),
      fails: { length: 0, hotels: 0, ascent: 0 },
    };
  }

  /**
   * The path of a candidate, if it has the right length, does not ride
   * back along itself and cuts into stages. Counts why others fail.
   */
  private fit(c: Candidate, costs: Costs, ck: Check): Pick | undefined {
    const graph = this.graph;
    const steps = chainPath(graph, c.nodes, costs, ck.avoid);
    if (!steps || !acceptable(graph, steps, ck.totalKm)) {
      ck.fails.length++;
      return undefined;
    }
    const start = c.nodes[0] ?? 0;
    const points = pathPoints(graph, start, steps);
    if (
      (ck.isLoop && comesBack(graph, points, ck.totalKm)) ||
      doublesBack(graph, points, ck.isLoop)
    ) {
      ck.fails.length++;
      return undefined;
    }
    const towns = stopCandidates(graph, points, ck.hotelNodes, ck.hotelCount);
    const cut = { ...ck.request, home: ck.isLoop ? ck.home : undefined };
    const stops = cutStages(points, towns, cut);
    if (!stops) {
      // Tell a missing town apart from too much climbing.
      const flat = { ...cut, maxAscentPerDay: Infinity };
      if (cutStages(points, towns, flat)) ck.fails.ascent++;
      else ck.fails.hotels++;
      return undefined;
    }
    const km = pathKm(graph, steps);
    const ascent = points.at(-1)?.ascent ?? 0;
    return { nodes: c.nodes, steps, stops, km, ascent, shared: 0 };
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
    const ck = this.checker(candidates, request, totalKm);

    // One-way trips first look for different ends, then allow repeats.
    const passes = ck.isLoop
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
        const p = this.fit(c, costs, ck);
        if (!p) continue;
        const edges = new Set(p.steps.map((s) => s.edge));
        let shared = 0;
        for (const e of edges)
          if (used.has(e)) shared += graph.edge(e).lengthKm;
        if (shared > MAX_SHARED * p.km) continue;

        picks.push({ ...p, shared: shared / p.km });
        for (const e of edges) {
          used.add(e);
          costs.penalty[e] = (costs.penalty[e] ?? 1) * VARIETY_PENALTY;
        }
      }
    }
    progress(tried.size);
    return { picks, failedLimit: failedLimit(ck, request) };
  }

  /**
   * Open day ride: proposals to ends in different directions, best first.
   * Far ends are at least MIN_TURN_DEG apart as seen from the start, and
   * at most one proposal is homeward. A second pass drops the angle when
   * too few fit.
   */
  private pickDestinations(
    candidates: Candidate[],
    costs: Costs,
    request: GenerateRequest,
    totalKm: number,
    progress: (tries: number) => void,
  ): { picks: Pick[]; failedLimit: FailedLimit } {
    const graph = this.graph;
    const startedAt = Date.now();
    const picks: Pick[] = [];
    const tried = new Set<Candidate>();
    const ck = this.checker(candidates, request, totalKm);
    const far = (c: { nodes: number[]; homeward?: boolean }) =>
      graph.coord((c.homeward ? c.nodes[0] : c.nodes.at(-1)) ?? 0);
    const first = candidates[0];
    const home = first
      ? graph.coord((first.homeward ? first.nodes.at(-1) : first.nodes[0]) ?? 0)
      : undefined;
    const heading = (c: { nodes: number[]; homeward?: boolean }) =>
      home ? bearing(home, far(c)) : 0;

    for (const minTurn of [MIN_TURN_DEG, 0]) {
      for (const c of candidates) {
        if (picks.length === PROPOSALS || tried.size === MAX_TRIES) break;
        if (picks.length && Date.now() - startedAt > TIME_LIMIT_MS) break;
        if (tried.has(c)) continue;
        if (c.homeward && picks.some((p) => p.homeward)) continue;
        const end = far(c);
        const h = heading(c);
        const close = picks.some(
          (p) =>
            distanceKm(far(p), end) < MIN_VIA_GAP_KM ||
            turn(heading(p), h) < minTurn,
        );
        if (close) continue;

        tried.add(c);
        if (tried.size % 10 === 0) progress(tried.size);
        const p = this.fit(c, costs, ck);
        if (!p) continue;
        const shared = Math.max(0, ...picks.map((q) => sharedKm(graph, p, q)));
        if (shared > MAX_SHARED * p.km) continue;
        picks.push({
          ...p,
          shared: shared / p.km,
          ...(c.homeward && { homeward: true }),
        });
        for (const s of p.steps) costs.penalty[s.edge] = VARIETY_PENALTY;
      }
    }
    progress(tried.size);
    return { picks, failedLimit: failedLimit(ck, request) };
  }

  /**
   * One proposal per flavour, each searched with its own edge costs. A
   * flavour is dropped if its path shares too much with an earlier one or
   * adds nothing. Flat and hilly are searched last, so they can be held
   * to the least and the most climbing of all.
   */
  private pickFlavours(
    candidates: (costs: Costs) => Candidate[],
    request: GenerateRequest,
    totalKm: number,
    progress: (tries: number) => void,
  ): { picks: Pick[]; failedLimit: FailedLimit } {
    const graph = this.graph;
    const picks: Pick[] = [];
    let best: Pick | undefined;
    let ck: Check | undefined;
    let tries = 0;
    const order = flavourOrder(request.theme, graph.hasScenery);
    const climbs: Flavour[] = ["flat", "hilly"];
    const search = [
      ...order.filter((f) => !climbs.includes(f)),
      ...climbs.filter((f) => order.includes(f)),
    ];
    for (const flavour of search) {
      const startedAt = Date.now();
      const costs = new Costs(graph, request, flavour);
      // Once per edge: compounding pushes late flavours into detours.
      for (const p of picks) {
        for (const s of p.steps) costs.penalty[s.edge] = VARIETY_PENALTY;
      }
      const list = candidates(costs);
      ck ??= this.checker(list, request, totalKm);
      // Hilly keeps the path that climbs most, until one reaches the target.
      const target =
        flavour === "hilly"
          ? (HILLY_TARGET * request.maxAscentPerDay * totalKm) /
            request.kmPerDay
          : 0;
      let found: Pick | undefined;
      let mine = 0;
      for (const c of list) {
        if (tries === MAX_TRIES) break;
        if (
          picks.length &&
          (mine === FLAVOUR_TRIES || Date.now() - startedAt > FLAVOUR_TIME_MS)
        ) {
          break;
        }
        mine++;
        if (++tries % 10 === 0) progress(tries);
        const p = this.fit(c, costs, ck);
        if (!p) continue;
        if (flavour === "best") best ??= p;
        const shared = Math.max(0, ...picks.map((q) => sharedKm(graph, p, q)));
        if (shared > MAX_SHARED * p.km) continue;
        if (!addsFlavour(graph, flavour, p, best, picks)) continue;
        if (!found || p.ascent > found.ascent) {
          found = { ...p, shared: shared / p.km, flavour };
        }
        if (found.ascent >= target) break;
      }
      if (found) picks.push(found);
    }
    progress(tries);
    const rank = (p: Pick) => order.indexOf(p.flavour ?? "best");
    return {
      picks: picks.sort((a, b) => rank(a) - rank(b)),
      failedLimit: ck ? failedLimit(ck, request) : emptyLimit(request),
    };
  }
}

/** Flavours to search, in the order they are shown. */
export function flavourOrder(theme: Theme | undefined, scenery: boolean) {
  const first = theme && scenery ? THEME_FLAVOUR[theme] : undefined;
  const all: Flavour[] = ["best", "nature", "flat", "hilly", "sights"];
  return [
    ...(first ? [first] : []),
    ...all.filter(
      (f) => f !== first && (scenery || (f !== "nature" && f !== "sights")),
    ),
  ];
}

/**
 * Does a path add its flavour? Flat must climb least and hilly most of
 * all proposals so far, both clearly apart from best. Scenery flavours
 * must have more scenery than best.
 */
function addsFlavour(
  graph: Graph,
  flavour: Flavour,
  p: Pick,
  best: Pick | undefined,
  picks: Pick[],
): boolean {
  const ascents = picks.map((q) => q.ascent);
  switch (flavour) {
    case "best":
      return true;
    case "flat":
      return (
        !!best &&
        p.ascent <= FLAT_SHARE * best.ascent &&
        p.ascent < Math.min(...ascents)
      );
    case "hilly":
      return (
        !!best &&
        p.ascent >= HILLY_GAIN * best.ascent &&
        p.ascent > Math.max(...ascents)
      );
    case "nature":
    case "sights": {
      const { gain, min } = MIN_SCENERY[flavour];
      const share = flavourValue(graph, p.steps, flavour);
      const base = best ? flavourValue(graph, best.steps, flavour) : 0;
      return share >= min && share >= base + gain;
    }
  }
}

/** Angle between two bearings, 0 to 180. */
function turn(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** The limit to blame when no candidate fits. */
function failedLimit(ck: Check, request: GenerateRequest): FailedLimit {
  const { fails } = ck;
  if (fails.ascent > 0 && fails.ascent >= fails.hotels)
    return "maxAscentPerDay";
  if (fails.hotels > 0) return "hotels";
  return emptyLimit(request);
}

function emptyLimit(request: GenerateRequest): FailedLimit {
  return request.region ? "area" : "days";
}

/** Meters climbed along a path. */
function pathAscent(graph: Graph, start: number, steps: PathStep[]): number {
  return pathPoints(graph, start, steps).at(-1)?.ascent ?? 0;
}

/** Share of km on signed cycle routes. */
export function signedShare(graph: Graph, steps: PathStep[]): number {
  let km = 0;
  let signed = 0;
  for (const s of steps) {
    const e = graph.edge(s.edge);
    km += e.lengthKm;
    if (e.routes.length > 0) signed += e.lengthKm;
  }
  return km ? Math.round((signed / km) * 1000) / 1000 : 0;
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
