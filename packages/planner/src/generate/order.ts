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
 * Best fit first: closeness to the requested km, then fewer weak stops,
 * then route quality.
 */
export function byFit(totalKm: number) {
  const band = (f: Fit) =>
    Math.floor(Math.abs(f.km - totalKm) / totalKm / LENGTH_BAND);
  return (a: Fit, b: Fit) =>
    band(a) - band(b) || (a.weak ?? 0) - (b.weak ?? 0) || b.quality - a.quality;
}
