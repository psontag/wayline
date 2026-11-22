/** Length off by less than this counts as an equal fit. */
export const LENGTH_BAND = 0.1;
/** A day off its target by less than this counts as an equal fit. */
export const DAY_BAND = 0.25;

export type Fit = {
  km: number;
  /** Km of each day and what the day should be. */
  days?: { km: number; target: number }[];
  /** Stops with few hotels. */
  weak?: number;
  /** Higher is better: way quality, less reuse. */
  quality: number;
};

/**
 * Sort key for the best fit first, lowest first: closeness to the requested
 * km, then days close to their km, then fewer weak stops, then route quality.
 */
export function fitRank(f: Fit, totalKm: number): number[] {
  const dayOff = Math.max(
    0,
    ...(f.days ?? []).map((d) => Math.abs(d.km - d.target) / d.target),
  );
  return [
    Math.floor(Math.abs(f.km - totalKm) / totalKm / LENGTH_BAND),
    Math.floor(dayOff / DAY_BAND),
    f.weak ?? 0,
    -f.quality,
  ];
}
