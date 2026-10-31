import type { HotelBudget, Trip } from "./schema";
import {
  addDays,
  addHours,
  ridingHours,
  stageStartTime,
  timeToHours,
} from "./time";

/** Booking.com price filter per budget, in EUR per night. */
export const budgetPrice: Record<HotelBudget, string> = {
  low: "EUR-0-80-1",
  mid: "EUR-80-140-1",
  high: "EUR-140-max-1",
};

/** Hotel rating filter. A user preference, not a trip setting. */
export type MinRating = 70 | 80 | 90;

/** Booking.com search for one night in a town. See docs/03-data-sources.md. */
export function bookingUrl(opts: {
  town: string;
  /** Check-in date "YYYY-MM-DD". Without it, Booking asks for dates. */
  date?: string;
  budget?: HotelBudget;
  minRating?: MinRating;
}): string {
  const params = searchParams(opts.town, opts.date);
  const filters = [
    opts.minRating && `review_score=${opts.minRating}`,
    opts.budget && `price=${budgetPrice[opts.budget]}`,
  ].filter(Boolean);
  if (filters.length) params.push(["nflt", filters.join(";")]);
  return `https://www.booking.com/searchresults.html?${query(params)}`;
}

/**
 * Booking.com search for one hotel by name and town, for one night. It
 * shows the live price and rating of that place, if Booking lists it.
 */
export function bookingHotelUrl(opts: {
  hotel: string;
  town: string;
  /** Check-in date "YYYY-MM-DD". Without it, Booking asks for dates. */
  date?: string;
}): string {
  const params = searchParams(`${opts.hotel} ${opts.town}`, opts.date);
  return `https://www.booking.com/searchresults.html?${query(params)}`;
}

function searchParams(text: string, date?: string): [string, string][] {
  const params: [string, string][] = [["ss", text]];
  if (date) params.push(["checkin", date], ["checkout", addDays(date, 1)]);
  params.push(["group_adults", "1"], ["no_rooms", "1"]);
  return params;
}

/** bahn.de connection search between two stations. */
export function bahnUrl(opts: {
  from: string;
  to: string;
  /** Local time "YYYY-MM-DDTHH:MM". Departure at this time. */
  time?: string;
  /** The time is the latest arrival, not the departure. */
  arrival?: boolean;
}): string {
  // bahn.de reads its search from the URL fragment. It runs the search
  // only with location ids. "A=1@O=<name>@" lets it match the name itself.
  const params: [string, string][] = [
    ["sts", "true"],
    ["so", opts.from],
    ["zo", opts.to],
  ];
  if (opts.from) params.push(["soid", `A=1@O=${opts.from}@`]);
  if (opts.to) params.push(["zoid", `A=1@O=${opts.to}@`]);
  if (opts.time) {
    params.push(["hd", `${opts.time}:00`], ["hza", opts.arrival ? "A" : "D"]);
  }
  return `https://www.bahn.de/buchung/fahrplan/suche#${query(params)}`;
}

/** A train search: from, to and the time to arrive by or leave at. */
export type TrainQuery = {
  from: string;
  to: string;
  /** Local time "YYYY-MM-DDTHH:MM" */
  time?: string;
  /** The time is the latest arrival, not the departure. */
  arrival?: boolean;
};

/**
 * Train from home to the start, arriving before the first day starts, and
 * back from the end, leaving after the last day's planned arrival. Without
 * a start date the links have no time. Without home, that field is empty.
 */
export function trainLinks(
  trip: Pick<Trip, "stages" | "startDate" | "settings">,
  home = "",
): { there?: string; back?: string } {
  const q = trainQueries(trip, home);
  return {
    ...(q.there && { there: bahnUrl(q.there) }),
    ...(q.back && { back: bahnUrl(q.back) }),
  };
}

/** The searches behind trainLinks. */
export function trainQueries(
  trip: Pick<Trip, "stages" | "startDate" | "settings">,
  home = "",
): { there?: TrainQuery; back?: TrainQuery } {
  const first = trip.stages[0];
  const last = trip.stages.at(-1);
  if (!first || !last) return {};
  const lastIndex = trip.stages.length - 1;
  const date = (i: number) =>
    trip.startDate ? addDays(trip.startDate, i) : undefined;
  const firstDate = date(0);
  const lastDate = date(lastIndex);
  const arrival = addHours(
    stageStartTime(trip.settings, lastIndex),
    ridingHours(last.stats, trip.settings.avgSpeed),
  );
  return {
    there: {
      from: home,
      to: first.start.name,
      ...(firstDate && {
        time: `${firstDate}T${stageStartTime(trip.settings, 0)}`,
      }),
      arrival: true,
    },
    back: {
      from: last.end.name,
      to: home,
      ...(lastDate && { time: `${lastDate}T${roundUpToHalfHour(arrival)}` }),
    },
  };
}

/** "14:10" → "14:30" */
function roundUpToHalfHour(time: string): string {
  const h = timeToHours(time);
  return addHours("00:00", Math.ceil(h * 2) / 2);
}

function query(params: [string, string][]): string {
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
