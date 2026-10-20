import {
  decodeLine,
  distanceKm,
  type Leg,
  type LonLat,
  type Place,
  type Stage,
  type Trip,
} from "@wayline/domain";
import { legPoints, type RouteFn, setStage, withLegs } from "./edits";

/** Moves a point onto the route network, if it is close to it. */
export type SnapFn = (coord: LonLat) => Promise<LonLat>;

export type RouteTools = { route: RouteFn; snap: SnapFn };

/** Parts of a route back and forth on the same road count from this long. */
const SPUR_KM = 0.05;
/** A route this close in length to the old one is the same route. */
const SAME_ROUTE_M = 50;
/** Two points this close are on the same road. */
const SAME_ROAD_KM = 0.03;

const viaPlace = (coord: LonLat): Place => ({
  name: "",
  kind: "custom",
  coord,
});

const same = (a: LonLat, b: LonLat) => distanceKm(a, b) < 0.001;

/** Index of the point between legs at a coordinate, if any. */
function joinAt(stage: Stage, coord: LonLat): number {
  return legPoints(stage).findIndex(
    (p, i) => i > 0 && i < stage.legs.length && same(p, coord),
  );
}

/**
 * Where a route through a via point turns back on itself: the via point
 * sits at the end of a spur that the legs ride out and back. Returns the
 * point where the spur starts, or undefined without a spur.
 */
export function spurStart(before: Leg, after: Leg): LonLat | undefined {
  const a = decodeLine(before.geometry).reverse();
  const b = decodeLine(after.geometry);
  let last: LonLat | undefined;
  let km = 0;
  for (const [i, p] of b.entries()) {
    if (!a.some((q) => distanceKm(p, q) < SAME_ROAD_KM)) break;
    const prev = b[i - 1];
    if (prev) km += distanceKm(prev, p);
    last = p;
  }
  return last && km >= SPUR_KM ? last : undefined;
}

/**
 * Routes from `from` through `at` to `to`. The via point snaps to the
 * network. If the route rides out and back to it, the via point moves to
 * where the spur starts.
 */
async function routeThrough(
  from: LonLat,
  at: LonLat,
  to: LonLat,
  { route, snap }: RouteTools,
): Promise<{ via: LonLat; legs: Leg[] }> {
  let via = await snap(at);
  let legs = await route([from, via, to]);
  const [before, after] = legs;
  const spur = before && after && spurStart(before, after);
  if (spur) {
    via = spur;
    legs = await route([from, via, to]);
  }
  return { via, legs };
}

/** Replaces the via point at a join, keeping the order along the stage. */
function withVia(stage: Stage, legs: Leg[], drop?: LonLat, add?: LonLat) {
  const via = stage.via.filter((v) => !drop || !same(v.coord, drop));
  if (add) via.push(viaPlace(add));
  const next = withLegs(stage, legs);
  const points = legPoints(next);
  const order = (v: Place) => points.findIndex((p) => same(p, v.coord));
  return { ...next, via: via.sort((a, b) => order(a) - order(b)) };
}

/** The route of a leg through a point, while it is dragged. Not saved. */
export async function previewVia(
  stage: Stage,
  leg: number,
  at: LonLat,
  { route, snap }: RouteTools,
): Promise<LonLat[]> {
  const points = legPoints(stage);
  const from = points[leg];
  const to = points[leg + 1];
  if (!from || !to) return [];
  const legs = await route([from, await snap(at), to]);
  return legs.flatMap((l) => decodeLine(l.geometry));
}

/**
 * Adds a via point on a leg of a stage. Only that leg is routed again.
 * A via point on the old route changes nothing, unless `keep` asks for it
 * as a handle to drag.
 */
export async function insertVia(
  trip: Trip,
  index: number,
  leg: number,
  at: LonLat,
  tools: RouteTools,
  keep = false,
): Promise<Trip> {
  const stage = trip.stages[index];
  const points = stage && legPoints(stage);
  const from = points?.[leg];
  const to = points?.[leg + 1];
  if (!stage || !from || !to) return trip;
  const routed = await routeThrough(from, at, to, tools);
  // The via point ended up on the old route.
  const old = stage.legs[leg]?.distance ?? 0;
  const km = routed.legs.reduce((sum, l) => sum + l.distance, 0);
  if (!keep && Math.abs(km - old) < SAME_ROUTE_M) return trip;
  const legs = [
    ...stage.legs.slice(0, leg),
    ...routed.legs,
    ...stage.legs.slice(leg + 1),
  ];
  return setStage(trip, index, withVia(stage, legs, undefined, routed.via));
}

/** Moves a via point. Only the two legs next to it are routed again. */
export async function moveVia(
  trip: Trip,
  index: number,
  coord: LonLat,
  at: LonLat,
  tools: RouteTools,
): Promise<Trip> {
  const stage = trip.stages[index];
  const i = stage ? joinAt(stage, coord) : -1;
  const points = stage && legPoints(stage);
  const from = points?.[i - 1];
  const to = points?.[i + 1];
  if (!stage || i < 0 || !from || !to) return trip;
  const routed = await routeThrough(from, at, to, tools);
  const legs = [
    ...stage.legs.slice(0, i - 1),
    ...routed.legs,
    ...stage.legs.slice(i + 1),
  ];
  return setStage(trip, index, withVia(stage, legs, coord, routed.via));
}

/** Removes a via point. The two legs next to it become one. */
export async function removeVia(
  trip: Trip,
  index: number,
  coord: LonLat,
  { route }: Pick<RouteTools, "route">,
): Promise<Trip> {
  const stage = trip.stages[index];
  const i = stage ? joinAt(stage, coord) : -1;
  const points = stage && legPoints(stage);
  const from = points?.[i - 1];
  const to = points?.[i + 1];
  if (!stage || i < 0 || !from || !to) return trip;
  const legs = [
    ...stage.legs.slice(0, i - 1),
    ...(await route([from, to])),
    ...stage.legs.slice(i + 1),
  ];
  return setStage(trip, index, withVia(stage, legs, coord));
}

const lineKey = (stage: Stage) =>
  stage.legs.map((leg) => leg.geometry).join("|");

/** Does the stage differ from its proposal: route, stop or hotel? */
export function isChanged(trip: Trip, index: number): boolean {
  const stage = trip.stages[index];
  const proposed = trip.proposed?.[index];
  if (!stage || !proposed) return false;
  return (
    lineKey(stage) !== lineKey(proposed) ||
    !same(stage.end.coord, proposed.end.coord) ||
    stage.hotel?.osmId !== proposed.hotel?.osmId
  );
}

/**
 * Puts a stage back as proposed: route, stop and hotel. If the stage
 * starts elsewhere now, its first leg comes from there. The next stage
 * then starts at the proposed stop: as proposed if it was not changed
 * otherwise, else with its first leg routed again.
 */
export async function revertStage(
  trip: Trip,
  index: number,
  { route }: Pick<RouteTools, "route">,
): Promise<Trip> {
  const stage = trip.stages[index];
  const proposed = trip.proposed?.[index];
  if (!stage || !proposed) return trip;

  let restored: Stage = { ...proposed, id: stage.id };
  if (!same(stage.start.coord, proposed.start.coord)) {
    const to = legPoints(proposed)[1] ?? proposed.end.coord;
    const [first] = await route([stage.start.coord, to]);
    if (first) {
      restored = withLegs({ ...restored, start: stage.start }, [
        first,
        ...proposed.legs.slice(1),
      ]);
    }
  }
  let next = trip.stages[index + 1];
  const proposedNext = trip.proposed?.[index + 1];
  if (next && !same(next.start.coord, restored.end.coord)) {
    const rest = { ...next, start: proposed.end };
    if (
      proposedNext &&
      !next.via.length &&
      same(next.end.coord, proposedNext.end.coord)
    ) {
      next = { ...proposedNext, id: next.id, hotel: next.hotel, end: next.end };
      if (!next.hotel) delete next.hotel;
    } else {
      const to = legPoints(next)[1] ?? next.end.coord;
      const [first] = await route([restored.end.coord, to]);
      next = first ? withLegs(rest, [first, ...next.legs.slice(1)]) : rest;
    }
  }
  const stages = trip.stages.map((s, i) =>
    i === index ? restored : i === index + 1 && next ? next : s,
  );
  return { ...trip, stages };
}
