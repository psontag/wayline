import {
  AVG_SPEED_KMH,
  bearing,
  CALM_KMH,
  distanceKm,
  type HourlyWind,
  type LonLat,
  windAt,
} from "@wayline/domain";
import type { Graph } from "../graph/Graph";
import type { Candidate } from "./search";

/** km/h. A full headwind this strong raises the cost by WIND_WEIGHT. */
const WIND_REF_KMH = 25;
const WIND_WEIGHT = 0.6;
/** A tailwind helps less than a headwind hurts. */
const TAIL_SHARE = 0.5;
/**
 * Headwind at the end of the ride costs this much more than at the start:
 * legs are tired then. Weights go from 1 − LATE / 2 to 1 + LATE / 2.
 */
const LATE = 0.4;
const MIN_FACTOR = 0.5;
/** Train out, ride home costs a bit more than riding from home. */
const HOMEWARD_COST = 1.1;

/** Wind of the ride day and the start time in hours. */
export type Ride = { wind: HourlyWind[]; startHour: number };

/**
 * Cost factor of the wind on a ride through these points, about 0.5 to
 * 1.6. Below 1 the wind helps. Parts are straight lines, scaled to the
 * total km, each with the wind of the hour it is ridden.
 */
export function windFactor(
  coords: LonLat[],
  totalKm: number,
  ride: Ride,
): number {
  const parts = coords.slice(1).map((b, i) => {
    const a = coords[i] as LonLat;
    return { km: distanceKm(a, b), bearing: bearing(a, b) };
  });
  const straight = parts.reduce((sum, p) => sum + p.km, 0);
  if (!straight) return 1;
  const scale = totalKm / straight;
  let done = 0;
  let effort = 0;
  let weights = 0;
  for (const p of parts) {
    const km = p.km * scale;
    const share = (done + km / 2) / totalKm;
    done += km;
    const w = windAt(
      ride.wind,
      ride.startHour + (share * totalKm) / AVG_SPEED_KMH,
    );
    const weight = km * (1 - LATE / 2 + LATE * share);
    weights += weight;
    if (!w || w.speed < CALM_KMH) continue;
    const head = w.speed * Math.cos(((w.from - p.bearing) * Math.PI) / 180);
    effort += weight * (head > 0 ? head : TAIL_SHARE * head);
  }
  if (!weights) return 1;
  return Math.max(
    MIN_FACTOR,
    1 + (WIND_WEIGHT * effort) / weights / WIND_REF_KMH,
  );
}

/**
 * Candidates ranked with the wind, best first. A loop is ridden in the
 * direction with less wind. An open ride is also tried as train out, ride
 * home, when that has a tailwind.
 */
export function windRanked(
  graph: Graph,
  candidates: Candidate[],
  totalKm: number,
  ride: Ride,
  homeward: boolean,
): Candidate[] {
  const out: Candidate[] = [];
  const factor = (nodes: number[]) =>
    windFactor(
      nodes.map((n) => graph.coord(n)),
      totalKm,
      ride,
    );
  for (const c of candidates) {
    const f = factor(c.nodes);
    const nodes = [...c.nodes].reverse();
    const back = factor(nodes);
    if (homeward) {
      out.push({ ...c, quality: c.quality * f });
      if (back < 1) {
        out.push({
          quality: c.quality * back * HOMEWARD_COST,
          nodes,
          homeward,
        });
      }
    } else if (back < f) {
      out.push({ quality: c.quality * back, nodes });
    } else {
      out.push({ ...c, quality: c.quality * f });
    }
  }
  return out.sort((a, b) => a.quality - b.quality);
}
