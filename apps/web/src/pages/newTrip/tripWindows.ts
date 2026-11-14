import type { AreaReach } from "./areas";
import { FORECAST_DAYS, ROUGH_AFTER_DAYS } from "./whereWeather";

/** Suggestions to show. */
const MAX_WINDOWS = 3;
/** Windows reaching past ROUGH_AFTER_DAYS count this much. */
const ROUGH_WEIGHT = 0.7;

export type TripWindow = {
  /** First day, as forecast days from today. */
  start: number;
  /** Areas dry on every day of the window, fastest first. */
  dry: AreaReach[];
  score: number;
  /** Reaches past ROUGH_AFTER_DAYS. */
  rough: boolean;
};

/**
 * The best trip windows of `days` days in the forecast, not overlapping.
 * Score: areas dry on every day, closer areas count more. Rough windows
 * count less. No window when nothing is dry.
 */
export function tripWindows(areas: AreaReach[], days: number): TripWindow[] {
  const all: TripWindow[] = [];
  for (let start = 0; start + days <= FORECAST_DAYS; start++) {
    const dry = areas
      .filter((a) => {
        const window = a.days?.slice(start, start + days) ?? [];
        return window.length === days && window.every((r) => r === "dry");
      })
      .sort((a, b) => (a.reach?.minutes ?? 0) - (b.reach?.minutes ?? 0));
    const rough = start + days - 1 > ROUGH_AFTER_DAYS;
    const score =
      dry.reduce((sum, a) => sum + 1 / (1 + (a.reach?.minutes ?? 0) / 60), 0) *
      (rough ? ROUGH_WEIGHT : 1);
    if (score > 0) all.push({ start, dry, score, rough });
  }
  const picked: TripWindow[] = [];
  for (const w of all.sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (picked.every((p) => Math.abs(p.start - w.start) >= days)) {
      picked.push(w);
    }
    if (picked.length === MAX_WINDOWS) break;
  }
  return picked;
}
