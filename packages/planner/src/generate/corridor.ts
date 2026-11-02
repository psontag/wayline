import { distanceKm, type LonLat } from "@wayline/domain";

/** Km per degree, about right for Germany. */
const KM_PER_LAT = 111;
const KM_PER_LON = 72;

/**
 * Share of route a, by km, in the same corridor as route b: within about
 * cellKm to 2 × cellKm of it. Shared km miss parallel roads, this does not.
 * Parts within ignoreKm of the ignored points don't count: all routes leave
 * the start the same way.
 */
export function corridorShare(
  a: LonLat[],
  b: LonLat[],
  cellKm: number,
  ignore: LonLat[] = [],
  ignoreKm = 0,
): number {
  const key = ([lon, lat]: LonLat) =>
    [
      Math.floor((lon * KM_PER_LON) / cellKm),
      Math.floor((lat * KM_PER_LAT) / cellKm),
    ] as const;
  const cells = new Set<string>();
  for (const p of along(b, cellKm)) {
    const [x, y] = key(p);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) cells.add(`${x + dx},${y + dy}`);
    }
  }
  let total = 0;
  let inside = 0;
  for (const p of along(a, cellKm)) {
    if (ignore.some((q) => distanceKm(p, q) < ignoreKm)) continue;
    total++;
    const [x, y] = key(p);
    if (cells.has(`${x},${y}`)) inside++;
  }
  return total ? inside / total : 0;
}

/** Points along a line, evenly spaced by about half a cell. */
function along(line: LonLat[], cellKm: number): LonLat[] {
  const step = cellKm / 2;
  const out: LonLat[] = [];
  let left = 0;
  for (let i = 1; i < line.length; i++) {
    const from = line[i - 1] as LonLat;
    const to = line[i] as LonLat;
    const km = distanceKm(from, to);
    while (left < km) {
      const t = left / km;
      out.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ]);
      left += step;
    }
    left -= km;
  }
  return out;
}
