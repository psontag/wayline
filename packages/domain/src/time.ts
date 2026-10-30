// Dates and times are local to the trip and carry no time zone.
// The math runs in UTC so the host time zone never shifts a value.

/** "2027-06-12" + 2 → "2027-06-14" */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Date of each stage: startDate + stage index. */
export function stageDates(startDate: string, stageCount: number): string[] {
  return Array.from({ length: stageCount }, (_, i) => addDays(startDate, i));
}

/**
 * Expected local time ("YYYY-MM-DDTHH:MM") at a km of a stage.
 * Breaks are not modeled.
 */
export function expectedTimeAtKm(
  date: string,
  startTime: string,
  avgSpeed: number,
  km: number,
): string {
  const start = new Date(`${date}T${startTime}:00Z`).getTime();
  const t = new Date(start + (km / avgSpeed) * 3_600_000);
  return t.toISOString().slice(0, 16);
}

/** Local time as a Date for display with the shared formatters. */
export function localTimeToDate(time: string): Date {
  const [date = "", hm = "00:00"] = time.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
}

/** A full riding day. A later start or an earlier arrival shortens a day. */
export const DAY_START = "09:00";
export const DAY_END = "17:00";
/** The shortest day the planner aims for, as a share of a full day. */
export const MIN_DAY_SHARE = 0.25;

function hours(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h + m / 60;
}

/**
 * Share of a full day for each day of a trip. The first day starts at
 * startTime, the last ends by backBy. Days in between are full.
 */
export function dayShares(
  days: number,
  startTime: string,
  backBy?: string,
): number[] {
  const full = hours(DAY_END) - hours(DAY_START);
  const clamp = (h: number) => Math.max(MIN_DAY_SHARE, Math.min(1, h / full));
  const shares = Array.from({ length: days }, () => 1);
  if (days < 2) return shares;
  shares[0] = clamp(hours(DAY_END) - hours(startTime));
  if (backBy) shares[days - 1] = clamp(hours(backBy) - hours(DAY_START));
  return shares.map((s) => Math.round(s * 100) / 100);
}

/**
 * Start time of a stage: the chosen ride start if set, else the trip start
 * on day one and DAY_START after.
 */
export function stageStartTime(
  settings: { startTime: string; rideStarts?: (string | null)[] },
  index: number,
): string {
  return (
    settings.rideStarts?.[index] ??
    (index === 0 ? settings.startTime : DAY_START)
  );
}

/** Extra riding minutes per 100 m of ascent, on top of km ÷ avgSpeed. */
export const CLIMB_MINUTES_PER_100M = 6;

/** Riding hours of a stage. Breaks are not included. */
export function ridingHours(
  stats: { distance: number; ascent: number },
  avgSpeed: number,
): number {
  return (
    stats.distance / 1000 / avgSpeed +
    (stats.ascent / 100) * (CLIMB_MINUTES_PER_100M / 60)
  );
}

/** km/h over the whole stage, with time for climbing included. */
export function stageSpeed(
  stats: { distance: number; ascent: number },
  avgSpeed: number,
): number {
  const h = ridingHours(stats, avgSpeed);
  return h > 0 ? stats.distance / 1000 / h : avgSpeed;
}

/** "09:00" + 1.5 → "10:30". Wraps after midnight. */
export function addHours(time: string, h: number): string {
  const minutes = Math.round((hours(time) + h) * 60);
  const m = ((minutes % 1440) + 1440) % 1440;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "10:30" → 10.5 */
export function timeToHours(time: string): number {
  return hours(time);
}
