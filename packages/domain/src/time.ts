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

/** Start time of a stage: the trip start on day one, DAY_START after. */
export function stageStartTime(
  settings: { startTime: string },
  index: number,
): string {
  return index === 0 ? settings.startTime : DAY_START;
}
