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
