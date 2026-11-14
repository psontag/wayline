import { type Area, decodeLine, type ReachRow } from "@wayline/domain";
import type { MultiPolygon } from "geojson";
import { bestReach, type Reach, type ReachFilter } from "./reach";
import type { Rain } from "./whereWeather";

export type AreaReach = {
  area: Area;
  /** Train to the fastest station of the area. Undefined: none within the changes. */
  reach?: Reach;
  /** Over the max train time, or no train. Shown faded. */
  over: boolean;
  /** Rain on each forecast day from today. Missing without a forecast. */
  days?: (Rain | undefined)[];
  /** The worst rain on the trip days. */
  rain?: Rain;
};

/** Each area with the train time to its fastest station. */
export function areaReach(
  areas: Area[],
  rows: Record<string, ReachRow>,
  filter: ReachFilter,
): AreaReach[] {
  return areas.map((area) => {
    let reach: Reach | undefined;
    for (const id of area.stations) {
      const row = rows[id];
      const r = row && bestReach(row, filter);
      if (r && (!reach || r.minutes < reach.minutes)) reach = r;
    }
    const over = !reach || reach.minutes > filter.maxHours * 60;
    return reach ? { area, reach, over } : { area, over };
  });
}

/** Areas within the max train time, fastest first. */
export function areasInReach(areas: AreaReach[]): AreaReach[] {
  return areas
    .filter((a) => !a.over)
    .sort(
      (a, b) =>
        (a.reach?.minutes ?? 0) - (b.reach?.minutes ?? 0) ||
        a.area.name.localeCompare(b.area.name),
    );
}

/** The outline of an area for the map. */
export function areaShape(area: Area): MultiPolygon {
  return {
    type: "MultiPolygon",
    coordinates: area.outline.map((polygon) =>
      polygon.map((ring) => {
        const points = decodeLine(ring);
        const [first, last] = [points[0], points.at(-1)];
        // GeoJSON rings end where they start.
        return first && last && first.join() !== last.join()
          ? [...points, first]
          : points;
      }),
    ),
  };
}
