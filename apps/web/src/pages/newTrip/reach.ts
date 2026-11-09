import type { ReachDay, ReachFile, ReachRow } from "@wayline/domain";
import type { ReachBand } from "@wayline/ui";

export type ReachFilter = {
  /** Longest train ride, in hours. */
  maxHours: 2 | 3 | 4 | 6;
  maxChanges: 1 | 2;
  /** IC and ICE with a bike reservation. Off: regional trains only. */
  fast: boolean;
};

export const defaultReachFilter: ReachFilter = {
  maxHours: 4,
  maxChanges: 1,
  fast: true,
};

export const reachHours = [2, 3, 4, 6] as const;

/** Upper end of each band, in hours. */
export const bandHours = [1, 2, 3, 4, 6] as const;
export const reachChanges = [1, 2] as const;

export type Reach = {
  minutes: number;
  changes: number;
  /** Uses an IC or ICE, which needs a bike reservation. */
  reservation: boolean;
};

/** Day type of a date, for the timetable of that day. */
export function reachDay(isoDate: string): ReachDay {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  if (day === 6) return "saturday";
  if (day === 0) return "sunday";
  return "weekday";
}

/** Fastest trip with the filter. Fewer changes win a tie. */
export function bestReach(
  row: ReachRow,
  filter: Pick<ReachFilter, "maxChanges" | "fast">,
): Reach | undefined {
  let best: Reach | undefined;
  for (let changes = 0; changes <= filter.maxChanges; changes++) {
    const minutes = filter.fast ? row[changes] : row[3 + changes];
    if (minutes == null || (best && minutes >= best.minutes)) continue;
    const reservation = filter.fast && (row[6] & (1 << changes)) !== 0;
    best = { minutes, changes, reservation };
  }
  return best;
}

/** Time band: 1 up to 1 h, … 5 up to 6 h. Undefined: longer. */
export function reachBand(minutes: number): ReachBand | undefined {
  const i = bandHours.findIndex((h) => minutes <= h * 60);
  return i < 0 ? undefined : ((i + 1) as ReachBand);
}

/** Times from home on the first day, by station id. */
export function reachOn(
  file: ReachFile,
  startDate: string,
): Record<string, ReachRow> {
  return file.out[reachDay(startDate)];
}
