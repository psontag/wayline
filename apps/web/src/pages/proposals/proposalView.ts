import {
  CALM_KMH,
  dayShares,
  type FailedLimit,
  type GenerateProgress,
  type GenerateRequest,
  type LonLat,
  pointAtKm,
  type Proposal,
  rainKind,
  ridingHours,
  type RoutePoint,
  routePoints,
  type RouteTag,
  shortTrip,
  type StageWeather,
  type Trip,
  tripStats,
  type WindShares,
} from "@wayline/domain";

/** Points along the whole trip, with km from the start. */
export function tripPoints(trip: Trip): RoutePoint[] {
  return routePoints(trip.stages.flatMap((stage) => stage.legs));
}

/** Numbers shown on a proposal card. Distances in m. */
export function proposalStats(trip: Trip) {
  const stats = tripStats(trip.stages);
  return {
    distance: stats.distance,
    ascent: stats.ascent,
    paved: stats.surface.paved,
    surface: stats.surface,
  };
}

/** Riding time of the whole trip in hours, without breaks. */
export function tripRidingHours(trip: Trip): number {
  return trip.stages.reduce(
    (sum, stage) => sum + ridingHours(stage.stats, trip.settings.avgSpeed),
    0,
  );
}

/** km from the trip start where each day after the first starts. */
export function dayBreaks(trip: Trip): number[] {
  let km = 0;
  return trip.stages.slice(0, -1).map((stage) => {
    km += stage.stats.distance / 1000;
    return km;
  });
}

export type ComparisonTag =
  "flattest" | "mostPaved" | "shortest" | "fastest" | "leastHeadwind";

type Measure = {
  tag: ComparisonTag;
  value: (p: Proposal) => number | undefined;
  /** Higher wins when true. */
  most: boolean;
  /** How far ahead of the runner-up the winner must be. */
  clear: (best: number, next: number) => boolean;
};

const measures: Measure[] = [
  {
    tag: "flattest",
    value: (p) => proposalStats(p.trip).ascent,
    most: false,
    clear: (best, next) => next - best >= Math.max(50, best * 0.1),
  },
  {
    tag: "mostPaved",
    value: (p) => proposalStats(p.trip).paved,
    most: true,
    clear: (best, next) => best - next >= 0.03,
  },
  {
    tag: "shortest",
    value: (p) => proposalStats(p.trip).distance,
    most: false,
    clear: (best, next) => next - best >= Math.max(3000, best * 0.03),
  },
  {
    tag: "fastest",
    value: (p) => tripRidingHours(p.trip),
    most: false,
    clear: (best, next) => next - best >= Math.max(0.25, best * 0.03),
  },
];

/**
 * Tags that set a proposal apart from the others, by proposal id. A tag goes
 * only to the one proposal that wins it by a clear margin. headwind holds
 * each proposal's headwind share; the wind tag waits until all are known.
 */
export function comparisonTags(
  proposals: Proposal[],
  headwind?: Map<string, number>,
): Map<string, ComparisonTag[]> {
  const tags = new Map<string, ComparisonTag[]>();
  if (proposals.length < 2) return tags;
  const wind: Measure[] =
    headwind && proposals.every((p) => headwind.has(p.id))
      ? [
          {
            tag: "leastHeadwind",
            value: (p) => headwind.get(p.id),
            most: false,
            clear: (best, next) => next - best >= 0.1,
          },
        ]
      : [];
  for (const m of [...measures, ...wind]) {
    const ranked = proposals
      .map((p) => ({ id: p.id, value: m.value(p) }))
      .filter((r): r is { id: string; value: number } => r.value !== undefined)
      .sort((a, b) => (m.most ? b.value - a.value : a.value - b.value));
    const [best, next] = ranked;
    if (!best || !next) continue;
    if (!m.clear(best.value, next.value)) continue;
    const own = tags.get(best.id) ?? [];
    // Shortest already says it.
    if (m.tag === "fastest" && own.includes("shortest")) continue;
    tags.set(best.id, [...own, m.tag]);
  }
  return tags;
}

/** Tags that say a proposal leaves the inputs. Shown first. */
const OFF_INPUT: readonly RouteTag[] = ["longer", "shorter", "moreClimbing"];

/**
 * Route tags to show, by proposal id: leaving the inputs first, then the
 * rarest in the list. A tag most proposals have says little, so it goes.
 * More climbing breaks a limit, so it always shows.
 */
export function shownRouteTags(proposals: Proposal[]): Map<string, RouteTag[]> {
  const counts = new Map<RouteTag, number>();
  for (const p of proposals) {
    for (const tag of p.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const rank = (tag: RouteTag) =>
    OFF_INPUT.includes(tag) ? -1 : (counts.get(tag) ?? 0);
  return new Map(
    proposals.map((p) => [
      p.id,
      (p.tags ?? [])
        .filter(
          (tag) =>
            tag === "moreClimbing" ||
            proposals.length < 2 ||
            (counts.get(tag) ?? 0) <= proposals.length / 2,
        )
        .sort((a, b) => rank(a) - rank(b)),
    ]),
  );
}

export type RainTag = { kind: "rain"; day?: number } | { kind: "dry" };

/**
 * Rain on the first wet day, or dry when all days are. Undefined when a day
 * has no forecast or only light rain falls.
 */
export function rainTag(days: StageWeather[] | undefined): RainTag | undefined {
  if (!days?.length) return undefined;
  const kinds = days.map(rainKind);
  const wet = kinds.indexOf("wet");
  if (wet >= 0) {
    return days.length > 1 ? { kind: "rain", day: wet + 1 } : { kind: "rain" };
  }
  return kinds.every((k) => k === "dry") ? { kind: "dry" } : undefined;
}

/**
 * Town each proposal is named after: its first via no earlier proposal has,
 * else its first via. Undefined without a via.
 */
export function titleTowns(proposals: Proposal[]): Map<string, string> {
  const used = new Set<string>();
  const towns = new Map<string, string>();
  for (const p of proposals) {
    const town = p.via.find((v) => !used.has(v)) ?? p.via[0];
    if (!town) continue;
    used.add(town);
    towns.set(p.id, town);
  }
  return towns;
}

/** Route each proposal is named after. Each route names one proposal. */
export function titleRoutes(proposals: Proposal[]): Map<string, string> {
  const used = new Set<string>();
  const routes = new Map<string, string>();
  for (const p of proposals) {
    if (!p.followedRoute || used.has(p.followedRoute)) continue;
    used.add(p.followedRoute);
    routes.set(p.id, p.followedRoute);
  }
  return routes;
}

export type WindTag = { kind: "tail" } | { kind: "head"; day: number };

/**
 * "Mostly tailwind" or the day with the most headwind. Undefined when a day
 * has no forecast or the wind does not stand out.
 */
export function windTag(
  days: ({ wind: WindShares; distance: number } | null)[],
): WindTag | undefined {
  if (days.length === 0 || days.some((d) => !d)) return undefined;
  const known = days as { wind: WindShares; distance: number }[];
  let worst: { day: number; head: number } | undefined;
  known.forEach((d, i) => {
    if (d.wind.avgSpeed < CALM_KMH || d.wind.head < 0.5) return;
    if (!worst || d.wind.head > worst.head) {
      worst = { day: i + 1, head: d.wind.head };
    }
  });
  if (worst) return { kind: "head", day: worst.day };
  const total = known.reduce((sum, d) => sum + d.distance, 0);
  const tail = known.reduce(
    (sum, d) =>
      sum + (d.wind.avgSpeed >= CALM_KMH ? d.wind.tail * d.distance : 0),
    0,
  );
  return total && tail / total >= 0.5 ? { kind: "tail" } : undefined;
}

/**
 * Where to put each proposal's label on the map: the point in the middle
 * part of its route that is farthest from all other routes and from the
 * points to avoid, e.g. stop markers.
 */
export function labelPoints(
  routes: RoutePoint[][],
  avoid: LonLat[] = [],
): LonLat[] {
  const samples = routes.map((points) => sample(points, 1));
  return routes.map((points, i) => {
    const total = points.at(-1)?.km ?? 0;
    const own = samples[i] ?? [];
    const others = samples.filter((_, j) => j !== i).flat();
    let best = pointAtKm(points, total / 2).coord;
    let bestGap = -1;
    for (const p of own) {
      if (p.km < 0.2 * total || p.km > 0.8 * total) continue;
      let gap = Infinity;
      for (const q of others) gap = Math.min(gap, flatKm(p.coord, q.coord));
      for (const q of avoid) gap = Math.min(gap, flatKm(p.coord, q));
      if (gap > bestGap) {
        bestGap = gap;
        best = p.coord;
      }
    }
    return best;
  });
}

/** Points about every `stepKm` km. */
function sample(points: RoutePoint[], stepKm: number): RoutePoint[] {
  const out: RoutePoint[] = [];
  let next = 0;
  for (const p of points) {
    if (p.km >= next) {
      out.push(p);
      next = p.km + stepKm;
    }
  }
  return out;
}

/** Good enough for comparing short distances. */
function flatKm(a: LonLat, b: LonLat): number {
  const x = (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180);
  const y = a[1] - b[1];
  return Math.hypot(x, y) * 111;
}

/** Overall share done, 0 to 1. Searching takes the most time. */
export function progressValue(progress: GenerateProgress | undefined): number {
  if (!progress) return 0;
  const share = progress.total ? progress.done / progress.total : 0;
  switch (progress.phase) {
    case "loading":
      return 0.05;
    case "searching":
      return 0.1 + 0.5 * share;
    case "cutting":
      return 0.65;
    case "routing":
      return 0.7 + 0.3 * share;
  }
}

/** A changed request that may find trips, with what changed. */
export type Relaxed =
  | { change: "maxAscentPerDay"; value: number; request: GenerateRequest }
  | { change: "kmPerDay"; value: number; request: GenerateRequest }
  | { change: "days"; value: number; request: GenerateRequest }
  | { change: "anyBudget"; request: GenerateRequest };

const roundTo = (value: number, step: number) =>
  Math.round(value / step) * step;

/** The request over fewer days. One day has no short days or hotels. */
export function withDays(
  request: GenerateRequest,
  days: number,
): GenerateRequest {
  if (days === 1) {
    const one = { ...request, days };
    delete one.dayShares;
    delete one.hotelBudget;
    return one;
  }
  return {
    ...request,
    days,
    ...(request.dayShares && {
      dayShares: dayShares(days, request.startTime, request.backBy),
    }),
  };
}

/**
 * A to B much shorter than the planned days, with the days that fit.
 * Undefined for other trips, and for a stretch of a signed route: the
 * route is the detour.
 */
export function shortRequest(request: GenerateRequest) {
  const { startStation, endStation } = request;
  if (request.kind !== "one-way" || !startStation || !endStation) return;
  if (request.route) return;
  const days = (request.dayShares ?? []).reduce(
    (sum, share) => sum + share,
    request.days - (request.dayShares?.length ?? 0),
  );
  const short = shortTrip(
    startStation.coord,
    endStation.coord,
    days,
    request.kmPerDay,
  );
  if (!short || short.days >= request.days) return;
  return { ...short, plannedKm: days * request.kmPerDay };
}

/** Up to two changes that relax the failed limit. Main one first. */
export function relaxOptions(
  request: GenerateRequest,
  limit: FailedLimit,
): Relaxed[] {
  const fewerKm = Math.max(20, roundTo(request.kmPerDay * 0.8, 5));
  const lessKm: Relaxed = {
    change: "kmPerDay",
    value: fewerKm,
    request: { ...request, kmPerDay: fewerKm },
  };
  const ascent = roundTo(request.maxAscentPerDay * 1.25, 50);
  const fewerDays = request.days - 1;

  const options: Relaxed[] = [];
  switch (limit) {
    case "maxAscentPerDay":
      options.push(
        {
          change: "maxAscentPerDay",
          value: ascent,
          request: { ...request, maxAscentPerDay: ascent },
        },
        lessKm,
      );
      break;
    case "hotels":
      if (request.hotelBudget) {
        options.push({
          change: "anyBudget",
          request: { ...request, hotelBudget: undefined },
        });
      }
      options.push(lessKm);
      break;
    case "days":
      if (fewerDays >= (request.kind === "multi-day-loop" ? 2 : 1)) {
        options.push({
          change: "days",
          value: fewerDays,
          request: withDays(request, fewerDays),
        });
      }
      options.push(lessKm);
      break;
    case "kmPerDay":
      options.push(lessKm);
      break;
    case "area":
      break;
  }
  return options.filter(
    (o) => o.change !== "kmPerDay" || fewerKm < request.kmPerDay,
  );
}
