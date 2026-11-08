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
  type RouteInfo,
  Theme,
  timeToHours,
  type Trip,
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
  seeksClimbs,
  VARIETY_PENALTY,
} from "./search";
import {
  cutStages,
  MIN_HOTELS,
  type PathPoint,
  pathPoints,
  type Stop,
  stopCandidates,
} from "./stages";
import { Stops } from "./stops";
import { corridorShare } from "./corridor";
import { NATIONAL, REGIONAL, RouteCatalog } from "./routeCatalog";
import {
  followedRoute,
  kmOnRoute,
  routeCandidates,
  kmUnused,
  routesInReach,
  type SignedRoute,
} from "./signedRoutes";
import { routeTags } from "./tags";
import { flavourValue, themeValue } from "./theme";
import { buildTrip, meanScore, routeNames, splitSteps, viaNames } from "./trip";
import { type Ride, windFactor, windRanked } from "./wind";

/** Proposals a trip should get at least. Also what one-day trips first look for. */
const PROPOSALS = 5;
/** Most proposals a trip gets. */
const MAX_PROPOSALS = 8;
/**
 * Fill: inputs to try in order. km and ascent scale the km per day and the
 * max ascent. Start, end, days and hotel budget stay as asked.
 */
const FILL_INPUTS = [
  { km: 1, ascent: 1 },
  { km: 0.8, ascent: 1 },
  { km: 1.2, ascent: 1 },
  { km: 1, ascent: 1.3 },
];
/**
 * Fill: how different a route must be, strictest first. turn: degrees from
 * every other route, when the end is free. shared: km on the same edges.
 * corridor: km near another route. gap: share of the via gap. upTo: the step
 * adds routes up to this count, so near copies only fill a short list.
 */
const FILL_STEPS = [
  { turn: 35, shared: 0.4, corridor: 0.6, gap: 1, upTo: MAX_PROPOSALS },
  { turn: 0, shared: 0.4, corridor: 0.6, gap: 1, upTo: MAX_PROPOSALS },
  { turn: 0, shared: 0.7, corridor: 1, gap: 0.5, upTo: PROPOSALS },
];
/**
 * Fill: time limit in ms, without building the first list. Each step gets its
 * share, so a strict step that finds little does not use up the time.
 */
const FILL_TIME_MS = 2500;
/** Fill: candidates to try per input and step. */
const FILL_TRIES = 60;
/** Width of a corridor cell in km. See corridorShare. */
const CORRIDOR_KM = 2;
/** Near both ends of a route, all routes share a corridor. */
const CORRIDOR_ENDS = { share: 0.08, minKm: 5 };
/** Via gap as a share of the trip, for short trips. */
const VIA_GAP_SHARE = 0.12;
/**
 * Proposals that follow a signed route. picks: slots they get. share: part of
 * the proposal on the route, and of the trip the route must have unused in
 * reach. sizes: trip lengths to try, as shares of the asked km per day; the
 * length check adds 12 % to them. corridor: km near another proposal. cost: edge cost on the route. routes, vias, tries:
 * limits per search, per route, per route and size. misses: tries without a
 * fit before a size is given up.
 */
const SIGNED = {
  picks: 4,
  share: 0.5,
  sizes: [1, 1.2],
  corridor: 0.6,
  cost: 0.2,
  routes: 12,
  vias: 12,
  tries: 30,
  misses: 8,
  nationalMisses: 3,
  timeMs: 2500,
};
/** A signed route counts this far from the start and end, as a share of the trip. */
const SIGNED_REACH = 1.45;
/** The same without an end, from the start only. */
const SIGNED_REACH_NO_END = 1.2;
/** A route with more than this share of its km in reach can fit a trip. */
const IN_REACH = 0.5;
const NONE = new Set<number>();
/** Climb-seeking proposals aim for this share of the max ascent. */
const SEEK_TARGET = 0.85;
/** Day trips need no hotels, so any node can be a via, up to about this many. */
const MAX_DAY_VIAS = 2000;
/** All flavours together, in ms. Keeps time for the fill on large areas. */
const FLAVOURS_TIME_MS = 4000;
/** Candidates to try before giving up. */
const MAX_TRIES = 300;
/** Search time limit in ms. Stops early once at least one proposal fits. */
const TIME_LIMIT_MS = 2000;
/** Max share of a proposal on edges of earlier proposals. */
const MAX_SHARED = 0.4;
/** Candidates to try per flavour, once some flavour has a proposal. */
const FLAVOUR_TRIES = 60;
/** Candidates to try after a flavour's first fit, for stops with more hotels. */
const STOP_TRIES = 15;
/** The same for climbing flavours, for paths that climb more. */
const CLIMB_TRIES = 40;
/** Fill when seeking climbs: fits to compare, keeping the one that climbs most. */
const SEEK_BATCH = 15;
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
  /** Stops with fewer than MIN_HOTELS hotels in town. */
  weak?: number;
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
  private catalog: RouteCatalog;
  private runs = 0;

  constructor(
    readonly graph: Graph,
    places: Places,
    routes?: RouteInfo[],
  ) {
    this.stops = new Stops(graph, places);
    this.catalog = new RouteCatalog(graph.edges, routes);
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

    const total =
      MAX_TRIES + FILL_INPUTS.length * FILL_STEPS.length * FILL_TRIES;
    onProgress?.({ phase: "searching", done: 0, total });
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
    const candidates = (c: Costs, km = totalKm, via = vias) => {
      const list =
        request.kind === "one-way"
          ? oneWayCandidates(
              graph,
              c,
              start,
              endStation === undefined
                ? this.stops.stationNodes().filter((n) => n !== start)
                : [endStation],
              via,
              km,
              endStation === undefined ? undefined : 0,
            )
          : loopCandidates(graph, c, start, via, km);
      return ride ? windRanked(graph, list, km, ride, open) : list;
    };
    const progress = (done: number) => {
      check();
      onProgress?.({ phase: "searching", done, total });
    };

    // Riding with the wind or to the direct path matters more than climbs.
    const seek = !direct && !open && !ride && seeksClimbs(request);
    // Trips of one day have no stops, so any node can turn them.
    const fillVias = request.days === 1 ? dayVias(graph) : vias;
    const end = request.kind === "one-way" ? endStation : start;
    const follow = (taken: Pick[]) =>
      this.followRoutes(
        taken,
        start,
        end,
        request,
        totalKm,
        fillVias,
        progress,
      );
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
      follow(picks);
    } else if (open) {
      found = this.pickDestinations(
        candidates(costs),
        costs,
        request,
        totalKm,
        progress,
      );
      picks = found.picks;
    } else {
      // Signed routes first, so flavours do not take their corridors.
      const themed: Pick[] = [];
      if (!ride) follow(themed);
      found = this.pickFlavours(
        candidates,
        request,
        totalKm,
        seek,
        themed,
        progress,
      );
      picks = [...themed, ...found.picks];
    }
    this.fill(
      picks,
      start,
      endStation !== undefined,
      seek,
      request,
      totalKm,
      (c, km) => candidates(c, km, fillVias),
      progress,
    );
    if (!picks.length) return { ok: false, failedLimit: found.failedLimit };
    const followed = new Map(
      picks.map((p) => [
        p,
        followedRoute(graph, p.steps, this.catalog, SIGNED.share),
      ]),
    );
    // The main proposal, then those that follow a route, then the rest.
    const place = (p: Pick) =>
      p === direct || p.flavour === "best" ? 0 : followed.get(p) ? 1 : 2;
    picks.sort((a, b) => place(a) - place(b));
    // Rides with the wind first. Close factors keep the search order.
    if (open && ride) {
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
    // Stages are cut during the search, since a path only counts if it cuts.
    onProgress?.({ phase: "cutting", done: picks.length, total: picks.length });

    // All at once: the routing provider limits how many requests are open.
    const routed = picks.map(async (p, i) => {
      // A homeward ride starts at another station, not a picked place.
      const placeAt = (node: number) =>
        this.endpoint(
          node,
          node === start
            ? request.startStation
            : node === endStation
              ? request.endStation
              : undefined,
        );
      const trip = buildTrip(graph, this.stops, {
        id: `draft-${runId}-${i + 1}`,
        now,
        request,
        start: placeAt(p.nodes[0] ?? start),
        end: placeAt(p.nodes.at(-1) ?? start),
        steps: p.steps,
        stops: p.stops,
      });
      if (p.homeward) {
        trip.name = `${trip.stages[0]?.start.name ?? ""} – ${request.startStation?.name ?? trip.stages.at(-1)?.end.name ?? ""}`;
      }
      if (!options.routing) return trip;
      const waypoints = stageWaypoints(
        graph,
        trip,
        splitSteps(p.steps, p.stops),
      );
      try {
        return await routeTrip(trip, waypoints, options.routing, signal);
      } catch {
        return trip;
      }
    });

    const urban = this.stops.urbanNodes();
    const proposals: Proposal[] = [];
    for (const [i, p] of picks.entries()) {
      check();
      onProgress?.({ phase: "routing", done: i, total: picks.length });
      const trip = await (routed[i] as Promise<Trip>);
      check();
      const from = p.nodes[0] ?? start;
      const proposal: Proposal = {
        id: `${runId}-${i + 1}`,
        trip,
        score: score(graph, p, totalKm),
        tags: routeTags(
          graph,
          p.steps,
          trip,
          urban,
          request,
          direct ? undefined : totalKm,
        ),
        signedShare: signedShare(graph, p.steps),
        routeNames: routeNames(graph, p.steps, this.catalog),
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
      const route = followed.get(p);
      if (route) proposal.followedRoute = route;
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
  /**
   * The place the user picked. The ride starts at the station it snapped
   * to, for the train links, but keeps the picked name.
   */
  private endpoint(node: number, requested?: Place): Place {
    if (this.graph.node(node).kind !== "station") {
      return requested ?? this.stops.station(node);
    }
    const station = this.stops.station(node);
    if (!requested || requested.kind === "station") return station;
    return { ...requested, coord: station.coord, station };
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
    const weak = stops.filter((s) => s.hotels < MIN_HOTELS).length;
    return { nodes: c.nodes, steps, stops, km, ascent, shared: 0, weak };
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
   * to the least and the most climbing of all. Flavours also differ from the
   * taken proposals and share the slots with them.
   */
  private pickFlavours(
    candidates: (costs: Costs) => Candidate[],
    request: GenerateRequest,
    totalKm: number,
    seek: boolean,
    taken: Pick[],
    progress: (tries: number) => void,
  ): { picks: Pick[]; failedLimit: FailedLimit } {
    const graph = this.graph;
    const picks: Pick[] = [];
    const others = () => [...taken, ...picks];
    let best: Pick | undefined;
    let ck: Check | undefined;
    let tries = 0;
    const flavoursStart = Date.now();
    const order = flavourOrder(graph.hasScenery);
    const climbs: Flavour[] = ["flat", "hilly"];
    const search = [
      ...order.filter((f) => !climbs.includes(f)),
      ...climbs.filter((f) => order.includes(f)),
    ];
    for (const flavour of search) {
      const startedAt = Date.now();
      if (others().length >= MAX_PROPOSALS) break;
      if (picks.length && startedAt - flavoursStart > FLAVOURS_TIME_MS) break;
      const climbing = flavour === "hilly" || (seek && flavour !== "flat");
      const costs = new Costs(graph, request, flavour, climbing);
      // Once per edge: compounding pushes late flavours into detours.
      for (const p of others()) {
        for (const s of p.steps) costs.penalty[s.edge] = VARIETY_PENALTY;
      }
      const list = candidates(costs);
      ck ??= this.checker(list, request, totalKm);
      // Climbing keeps the path that climbs most, until one reaches the target.
      const target = climbing
        ? ((seek ? SEEK_TARGET : HILLY_TARGET) *
            request.maxAscentPerDay *
            totalKm) /
          request.kmPerDay
        : 0;
      let found: Pick | undefined;
      let mine = 0;
      // Tries since the first fit. Keeps looking for stops with more hotels.
      let more = 0;
      for (const c of list) {
        if (tries === MAX_TRIES) break;
        if (
          picks.length &&
          (mine === FLAVOUR_TRIES || Date.now() - startedAt > FLAVOUR_TIME_MS)
        ) {
          break;
        }
        if (found && more++ === (climbing ? CLIMB_TRIES : STOP_TRIES)) break;
        mine++;
        if (++tries % 10 === 0) progress(tries);
        const p = this.fit(c, costs, ck);
        if (!p) continue;
        if (flavour === "best") best ??= p;
        const shared = Math.max(
          0,
          ...others().map((q) => sharedKm(graph, p, q)),
        );
        if (shared > MAX_SHARED * p.km) continue;
        if (!addsFlavour(graph, flavour, p, best, picks, seek)) continue;
        // Climbing: more climbing first. Others: fewer weak stops, else the first.
        const better = !found
          ? true
          : climbing
            ? p.ascent > found.ascent ||
              (p.ascent >= target && (p.weak ?? 0) < (found.weak ?? 0))
            : (p.weak ?? 0) < (found.weak ?? 0);
        if (better) found = { ...p, shared: shared / p.km, flavour };
        if (found && found.ascent >= target && !found.weak) break;
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

  /**
   * Adds proposals that ride mostly on one signed route. Without an end, they
   * stop at a station near the route.
   */
  private followRoutes(
    picks: Pick[],
    start: number,
    end: number | undefined,
    request: GenerateRequest,
    totalKm: number,
    vias: number[],
    progress: (tries: number) => void,
  ) {
    const graph = this.graph;
    const costs = new Costs(graph, request);
    const fromStart = costs.from(graph, start);
    const fromEnd = end === undefined ? undefined : costs.from(graph, end);
    const routes = routesInReach(graph, this.catalog, (n) =>
      fromEnd
        ? (fromStart.km[n] ?? Infinity) + (fromEnd.km[n] ?? Infinity) <=
          SIGNED_REACH * totalKm
        : (fromStart.km[n] ?? Infinity) <= SIGNED_REACH_NO_END * totalKm,
    );
    const sizes = SIGNED.sizes.map((size) => {
      const km = size * totalKm;
      const asked = { ...request, kmPerDay: size * request.kmPerDay };
      const ck = this.checker([{ quality: 0, nodes: [start] }], asked, km);
      return { km, ck };
    });
    const line = routeLine(graph, start);
    const endsKm = Math.max(CORRIDOR_ENDS.minKm, CORRIDOR_ENDS.share * totalKm);
    const startedAt = Date.now();
    const inTime = () => Date.now() - startedAt < SIGNED.timeMs;
    const used = new Set(picks.flatMap((p) => p.steps.map((s) => s.edge)));
    let added = 0;
    let nationalMisses = 0;
    for (let i = 0; i < SIGNED.routes; i++) {
      if (added === SIGNED.picks || !inTime()) break;
      if (picks.length >= MAX_PROPOSALS) break;
      progress(MAX_TRIES);
      // Local routes last. Then routes mostly in reach, since those fit a trip.
      // Then the most important, then the most km no proposal rides yet.
      let on: SignedRoute | undefined;
      let best: number[] = [];
      for (const route of routes) {
        // Long routes near a trip often don't fit it. Leaves time for the rest.
        if (
          route.rank === NATIONAL &&
          nationalMisses >= SIGNED.nationalMisses
        ) {
          continue;
        }
        const km = kmUnused(graph, route, used);
        if (km < SIGNED.share * totalKm) continue;
        const inReach = kmUnused(graph, route, NONE);
        const order = [
          route.rank > REGIONAL ? 1 : 0,
          inReach > IN_REACH * this.catalog.km(route.name) ? 0 : 1,
          route.rank,
          -km,
        ];
        if (!on || isBefore(order, best)) {
          on = route;
          best = order;
        }
      }
      if (!on) break;
      routes.splice(routes.indexOf(on), 1);
      const route = on;
      const rides = (p: Pick) =>
        kmOnRoute(graph, p.steps, route) >= SIGNED.share * p.km;
      if (picks.some(rides)) continue;
      costs.penalty.fill(1);
      for (const p of picks) {
        for (const s of p.steps) costs.penalty[s.edge] = VARIETY_PENALTY;
      }
      for (const id of route.edges) costs.penalty[id] = SIGNED.cost;
      const list = routeCandidates(
        graph,
        costs,
        start,
        end,
        route,
        vias,
        SIGNED.vias,
      );
      // Keeps the path with the most km on the route.
      let found: Pick | undefined;
      let longest = 0;
      for (const { km, ck } of sizes) {
        const fits = list.filter((c) => Math.abs(c.km - km) < 0.1 * km);
        let tried = 0;
        let fitted = false;
        for (const c of fits.slice(0, SIGNED.tries)) {
          if (!inTime() || (!fitted && tried++ === SIGNED.misses)) break;
          const p = this.fit(c, costs, ck);
          if (!p) continue;
          fitted = true;
          if (!rides(p)) continue;
          const ridden = kmOnRoute(graph, p.steps, route);
          if (ridden <= longest) continue;
          const shared = Math.max(
            0,
            ...picks.map((q) => sharedKm(graph, p, q)),
          );
          if (shared > MAX_SHARED * p.km) continue;
          if (nearOther(p, picks, line, endsKm, SIGNED.corridor)) continue;
          found = { ...p, shared: shared / p.km };
          longest = ridden;
        }
      }
      if (!found && route.rank === NATIONAL) nationalMisses++;
      if (found) {
        picks.push(found);
        for (const s of found.steps) used.add(s.edge);
        added++;
      }
    }
  }

  /**
   * Adds proposals to the picks, up to MAX_PROPOSALS. Tries the inputs as
   * asked first, then wider ones. For each, routes that differ most first.
   */
  private fill(
    picks: Pick[],
    start: number,
    endFixed: boolean,
    seek: boolean,
    request: GenerateRequest,
    totalKm: number,
    candidates: (costs: Costs, km: number) => Candidate[],
    progress: (tries: number) => void,
  ) {
    const graph = this.graph;
    let left = FILL_TIME_MS;
    const home = graph.coord(start);
    const line = routeLine(graph, start);
    const heading = (p: Pick) => bearing(home, farthest(home, line(p)));
    const gapKm = Math.min(MIN_VIA_GAP_KM, VIA_GAP_SHARE * totalKm);
    const endsKm = Math.max(CORRIDOR_ENDS.minKm, CORRIDOR_ENDS.share * totalKm);
    const mids = (nodes: number[]) => nodes.slice(1, -1);
    let tries = 0;

    for (const input of FILL_INPUTS) {
      if (picks.length >= MAX_PROPOSALS || left <= 0) return;
      const km = totalKm * input.km;
      const asked = {
        ...request,
        kmPerDay: request.kmPerDay * input.km,
        maxAscentPerDay: request.maxAscentPerDay * input.ascent,
      };
      const costs = new Costs(graph, asked, undefined, seek);
      const listStart = Date.now();
      const list = candidates(costs, km);
      if (input !== FILL_INPUTS[0]) left -= Date.now() - listStart;
      const ck = this.checker(list, asked, km);
      for (const step of FILL_STEPS) {
        if (step.turn && endFixed) continue;
        for (const p of picks) {
          for (const s of p.steps) costs.penalty[s.edge] = VARIETY_PENALTY;
        }
        let mine = 0;
        const stepStart = Date.now();
        const stepMs = Math.min(left, FILL_TIME_MS / FILL_STEPS.length);
        const add = (p: Pick) => {
          picks.push(p);
          for (const s of p.steps) costs.penalty[s.edge] = VARIETY_PENALTY;
        };
        // Seeking climbs: the fit that climbs most of a batch.
        let held: Pick | undefined;
        for (const c of list) {
          if (held && mine % SEEK_BATCH === 0) {
            add(held);
            held = undefined;
          }
          if (picks.length >= step.upTo || mine === FILL_TRIES) break;
          if (Date.now() - stepStart > stepMs) break;
          if (c.homeward && picks.some((p) => p.homeward)) continue;
          const via = mids(c.nodes);
          const close = picks.some((p) =>
            mids(p.nodes).some((v) =>
              via.some(
                (w) =>
                  distanceKm(graph.coord(v), graph.coord(w)) < gapKm * step.gap,
              ),
            ),
          );
          if (close) continue;

          mine++;
          if (++tries % 10 === 0) progress(MAX_TRIES + tries);
          const p = this.fit(c, costs, ck);
          if (!p) continue;
          const shared = Math.max(
            0,
            ...picks.map((q) => sharedKm(graph, p, q)),
          );
          if (shared > step.shared * p.km) continue;
          if (nearOther(p, picks, line, endsKm, step.corridor)) continue;
          if (
            step.turn &&
            picks.some((q) => turn(heading(q), heading(p)) < step.turn)
          ) {
            continue;
          }
          const kept: Pick = {
            ...p,
            shared: shared / p.km,
            ...(c.homeward && { homeward: true }),
          };
          if (!seek) add(kept);
          else if (!held || kept.ascent > held.ascent) held = kept;
        }
        if (held && picks.length < step.upTo) add(held);
        left -= Date.now() - stepStart;
      }
    }
  }
}

/** Compares two lists of numbers, first number first. */
function isBefore(a: number[], b: number[]): boolean {
  for (const [i, n] of a.entries()) {
    const m = b[i] ?? 0;
    if (n !== m) return n < m;
  }
  return false;
}

/** Line of a pick, kept per pick. */
function routeLine(graph: Graph, start: number) {
  const lines = new Map<Pick, LonLat[]>();
  return (p: Pick) => {
    let l = lines.get(p);
    if (!l) {
      l = pathPoints(graph, p.nodes[0] ?? start, p.steps).map((q) =>
        graph.coord(q.node),
      );
      lines.set(p, l);
    }
    return l;
  };
}

/** Does a pick run near another for more than the limit? */
function nearOther(
  p: Pick,
  picks: Pick[],
  line: (p: Pick) => LonLat[],
  endsKm: number,
  limit: number,
): boolean {
  const a = line(p);
  const ends = [a[0], a.at(-1)].filter((c) => c !== undefined);
  return picks.some(
    (q) => corridorShare(a, line(q), CORRIDOR_KM, ends, endsKm) > limit,
  );
}

/** Point of a line farthest from a place. */
function farthest(from: LonLat, line: LonLat[]): LonLat {
  let best = from;
  let bestKm = -1;
  for (const p of line) {
    const km = distanceKm(from, p);
    if (km > bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
}

/** Vias for day trips: towns and stations, and an even part of the junctions. */
function dayVias(graph: Graph): number[] {
  const every = Math.ceil(graph.nodes.length / MAX_DAY_VIAS);
  return graph.nodes
    .filter((n, i) => n.kind !== "junction" || i % every === 0)
    .map((n) => n.id);
}

/** Flavours to search, in the order they are shown. */
export function flavourOrder(scenery: boolean) {
  const all: Flavour[] = ["best", "nature", "flat", "hilly", "sights"];
  return all.filter((f) => scenery || (f !== "nature" && f !== "sights"));
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
  seek: boolean,
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
        // When all climb, best is no baseline: hilly only has to climb most.
        (seek || p.ascent >= HILLY_GAIN * best.ascent) &&
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
  const [network, places, routes] = await Promise.all([
    source.network(),
    source.places(),
    source.routes?.(),
  ]);
  return new Planner(new Graph(network), places, routes);
}

/** Planners for the area of each request. Loads only the tiles it needs. */
export class Planners {
  private areas: AreaCache<Planner>;
  private routes?: RouteInfo[];

  constructor(private source: RouteNetworkSource) {
    this.areas = new AreaCache(
      source,
      (network, places) => new Planner(new Graph(network), places, this.routes),
    );
  }

  async for(request: GenerateRequest): Promise<Planner> {
    this.routes ??= await this.source.routes?.();
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
 * Higher is better. Nice edges, length close to the target and little
 * overlap with earlier proposals.
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
