import { addHours, type TrainQuery, timeToHours } from "@wayline/domain";
import type { TrainOption, TrainProvider } from "../types";

/**
 * Made-up hourly trains. The same stations always give the same lines and
 * duration.
 */
export class FakeTrains implements TrainProvider {
  async connections(
    query: TrainQuery & { time: string },
  ): Promise<TrainOption[]> {
    const seed = hash(`${query.from}|${query.to}`);
    const hours = 1 + (seed % 7) / 2;
    const changes = seed % 3;
    const lines = ["ICE 591", "IC 2063", "RE 4", "RB 22"].slice(
      seed % 2,
      (seed % 2) + changes + 1,
    );
    const [date = "", time = "00:00"] = query.time.split("T");
    const minute = (seed % 50) / 60;
    // Hourly departures. For an arrival time, the last ones that make it.
    const start = Math.max(
      minute,
      query.arrival
        ? Math.floor(timeToHours(time) - hours - minute) + minute - 2
        : Math.ceil(timeToHours(time) - minute) + minute,
    );
    return [0, 1, 2].map((i) => {
      const dep = start + i;
      return {
        from: query.from,
        to: query.to,
        departure: `${date}T${addHours("00:00", dep)}`,
        arrival: `${date}T${addHours("00:00", dep + hours)}`,
        changes,
        lines,
      };
    });
  }
}

function hash(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
