import {
  dayShares,
  type FailedLimit,
  type GenerateProgress,
  type GenerateRequest,
  type LonLat,
  pointAtKm,
  type RoutePoint,
  routePoints,
  type Trip,
  tripStats,
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
    longestDay: Math.max(0, ...trip.stages.map((s) => s.stats.distance)),
  };
}

/** Elevation at evenly spaced points, for the sparkline. */
export function elevationSamples(points: RoutePoint[], count = 60): number[] {
  const total = points.at(-1)?.km ?? 0;
  if (points.length < 2 || total === 0) return [];
  return Array.from(
    { length: count },
    (_, i) => pointAtKm(points, (i / (count - 1)) * total).ele,
  );
}

/**
 * Where to put each proposal's number on the map: the point in the middle
 * part of its route that is farthest from all other routes.
 */
export function labelPoints(routes: RoutePoint[][]): LonLat[] {
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
          request: {
            ...request,
            days: fewerDays,
            ...(request.dayShares
              ? {
                  dayShares: dayShares(
                    fewerDays,
                    request.startTime,
                    request.backBy,
                  ),
                }
              : {}),
          },
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
