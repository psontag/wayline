import type { LonLat, Proposal } from "@wayline/domain";
import type { MultiPolygon } from "geojson";
import { tripPoints } from "./proposalView";

/** Points tested per proposal. Enough to tell 10 % steps apart. */
const SAMPLES = 100;

/** Share of a proposal's route inside the area, from 0 to 1. */
export function areaShare(proposal: Proposal, area: MultiPolygon): number {
  const points = tripPoints(proposal.trip);
  if (points.length === 0) return 0;
  const step = Math.max(1, Math.floor(points.length / SAMPLES));
  const sample = points.filter((_, i) => i % step === 0);
  return sample.filter((p) => inArea(p.coord, area)).length / sample.length;
}

/** Inside an outer ring and outside its holes, in any polygon. */
export function inArea(point: LonLat, area: MultiPolygon): boolean {
  return area.coordinates.some(
    ([outer, ...holes]) =>
      !!outer &&
      inRing(point, outer) &&
      !holes.some((hole) => inRing(point, hole)),
  );
}

function inRing([x, y]: LonLat, ring: number[][]): boolean {
  let inside = false;
  let prev = ring.at(-1);
  for (const point of ring) {
    const [xi = 0, yi = 0] = point;
    const [xj = 0, yj = 0] = prev ?? point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    prev = point;
  }
  return inside;
}
