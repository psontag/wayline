import {
  addDays,
  decodeLine,
  distanceKm,
  type LonLat,
  type NetworkClass,
  type Place,
  type ReachFile,
  type RoutePart,
  type RouteStationsFile,
} from "@wayline/domain";
import { type SceneryTag, sceneryTags } from "@wayline/planner";
import { bestReach, type Reach, type ReachFilter, reachDay } from "./reach";

/** A stretch may be this much shorter or longer than the trip. */
const FIT = 0.15;

export type ShelfStop = { place: Place; km: number; reach: Reach };

/** Where to get on and off a route, with the trains there and back. */
export type Stretch = {
  /** Index in ShelfRoute.parts. */
  part: number;
  from: ShelfStop;
  to: ShelfStop;
  km: number;
  /** Train out plus train back. */
  trainMinutes: number;
};

export type ShelfRoute = {
  name: string;
  network: NetworkClass;
  lengthKm: number;
  tags: SceneryTag[];
  /** Stations along it with a train from home within the max time. */
  stations: number;
  /** Km between the first and last of those stations. */
  reachKm: number;
  /** Missing if no stretch of the trip's km has trains at both ends. */
  stretch?: Stretch;
  parts: RoutePart[];
};

/**
 * Signed routes with stations in reach. Routes with a stretch come first,
 * then the ones with the most km in reach.
 */
export function shelfRoutes({
  file,
  reach,
  stations,
  filter,
  startDate,
  days,
  km,
}: {
  file: RouteStationsFile;
  reach: ReachFile;
  /** Stations by id. */
  stations: Map<string, Place>;
  filter: ReachFilter;
  startDate: string;
  days: number;
  /** Km of the whole trip. */
  km: number;
}): ShelfRoute[] {
  const out = reach.out[reachDay(startDate)];
  const back = reach.back[reachDay(addDays(startDate, days - 1))];
  const maxMinutes = filter.maxHours * 60;
  const within = (row: (typeof out)[string] | undefined) => {
    const r = row && bestReach(row, filter);
    return r && r.minutes <= maxMinutes ? r : undefined;
  };

  const routes: ShelfRoute[] = [];
  for (const route of file.routes) {
    let count = 0;
    let reachKm = 0;
    let stretch: Stretch | undefined;
    const seen = new Set<string>();
    route.parts.forEach((part, index) => {
      const starts: ShelfStop[] = [];
      const ends: ShelfStop[] = [];
      for (const [id, at] of part.stations) {
        const place = stations.get(id);
        if (!place) continue;
        const there = within(out[id]);
        const home = within(back[id]);
        if (there) {
          starts.push({ place, km: at, reach: there });
          if (!seen.has(id)) count++;
          seen.add(id);
        }
        if (home) ends.push({ place, km: at, reach: home });
      }
      const [first, last] = [starts[0], starts.at(-1)];
      if (first && last) reachKm += last.km - first.km;
      const best = bestStretch(starts, ends, km);
      if (best && (!stretch || isBetter(best, stretch, km))) {
        stretch = { ...best, part: index };
      }
    });
    if (!count) continue;
    routes.push({
      name: route.name,
      network: route.network,
      lengthKm: sum(route.parts.map((p) => p.lengthKm)),
      tags: routeTags(route.parts),
      stations: count,
      reachKm,
      ...(stretch && { stretch }),
      parts: route.parts,
    });
  }
  return routes.sort(
    (a, b) =>
      Number(!a.stretch) - Number(!b.stretch) ||
      b.reachKm - a.reachKm ||
      a.name.localeCompare(b.name),
  );
}

/** Least train time out and back, for a stretch close to km. Either way along the route. */
function bestStretch(
  starts: ShelfStop[],
  ends: ShelfStop[],
  km: number,
): Omit<Stretch, "part"> | undefined {
  let best: Omit<Stretch, "part"> | undefined;
  for (const from of starts) {
    for (const to of ends) {
      const length = Math.abs(to.km - from.km);
      if (Math.abs(length - km) > FIT * km) continue;
      if (from.place.osmId === to.place.osmId) continue;
      const s = {
        from,
        to,
        km: length,
        trainMinutes: from.reach.minutes + to.reach.minutes,
      };
      if (!best || isBetter(s, best, km)) best = s;
    }
  }
  return best;
}

function isBetter(
  a: Omit<Stretch, "part">,
  b: Omit<Stretch, "part">,
  km: number,
): boolean {
  if (a.trainMinutes !== b.trainMinutes) return a.trainMinutes < b.trainMinutes;
  return Math.abs(a.km - km) < Math.abs(b.km - km);
}

function routeTags(parts: RoutePart[]): SceneryTag[] {
  const km = sum(parts.map((p) => p.lengthKm));
  const ascent = sum(parts.map((p) => p.ascent));
  const withScenery = parts.filter((p) => p.scenery);
  const sceneryKm = sum(withScenery.map((p) => p.lengthKm));
  const scenery = sceneryKm
    ? {
        forest: weighted(withScenery, "forest", sceneryKm),
        water: weighted(withScenery, "water", sceneryKm),
        vineyard: weighted(withScenery, "vineyard", sceneryKm),
        nature: weighted(withScenery, "nature", sceneryKm),
        sights: weighted(withScenery, "sights", sceneryKm),
      }
    : undefined;
  return sceneryTags(scenery, km ? ascent / km : 0);
}

function weighted(
  parts: RoutePart[],
  key: keyof NonNullable<RoutePart["scenery"]>,
  km: number,
): number {
  return sum(parts.map((p) => (p.scenery?.[key] ?? 0) * p.lengthKm)) / km;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** The line of a part between two km along it. */
export function partLine(
  part: RoutePart,
  fromKm: number,
  toKm: number,
): LonLat[] {
  const points = decodeLine(part.line).map((coord) => ({ coord, km: 0 }));
  let prev: (typeof points)[number] | undefined;
  for (const p of points) {
    p.km = prev ? prev.km + distanceKm(prev.coord, p.coord) : 0;
    prev = p;
  }
  // The simplified line is a bit shorter than the route.
  const scale = (prev?.km ?? 0) / part.lengthKm || 1;
  const lo = Math.min(fromKm, toKm) * scale;
  const hi = Math.max(fromKm, toKm) * scale;
  const out: LonLat[] = [];
  let before: (typeof points)[number] | undefined;
  for (const p of points) {
    for (const at of [lo, hi]) {
      if (before && before.km < at && p.km >= at) {
        const t = (at - before.km) / (p.km - before.km);
        out.push([
          before.coord[0] + (p.coord[0] - before.coord[0]) * t,
          before.coord[1] + (p.coord[1] - before.coord[1]) * t,
        ]);
      }
    }
    if (p.km >= lo && p.km <= hi) out.push(p.coord);
    before = p;
  }
  return fromKm <= toKm ? out : out.reverse();
}
