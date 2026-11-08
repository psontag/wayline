/** Length off by less than this counts as an equal fit. */
export const LENGTH_BAND = 0.1;

export type Fit = {
  km: number;
  /** Stops with few hotels. */
  weak?: number;
  /** Higher is better: way quality, less reuse. */
  quality: number;
};

/**
 * Sort key for the best fit first, lowest first: closeness to the requested
 * km, then fewer weak stops, then route quality.
 */
export function fitRank(f: Fit, totalKm: number): number[] {
  return [
    Math.floor(Math.abs(f.km - totalKm) / totalKm / LENGTH_BAND),
    f.weak ?? 0,
    -f.quality,
  ];
}
