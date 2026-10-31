import type { HotelBudget, LonLat, Trip } from "./schema";
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

/** Booking.com review score filter: 8+. */
const MIN_RATING = 80;

/** Booking.com search for one night in a town. See docs/03-data-sources.md. */
export function bookingUrl(opts: {
  town: string;
  /** Check-in date "YYYY-MM-DD". Without it, Booking asks for dates. */
  date?: string;
  budget?: HotelBudget;
}): string {
  const params = searchParams(opts.town, opts.date);
  const filters = [
    `review_score=${MIN_RATING}`,
    opts.budget && `price=${budgetPrice[opts.budget]}`,
  ].filter(Boolean);
  params.push(["nflt", filters.join(";")]);
  return `https://www.booking.com/searchresults.html?${query(params)}`;
}

/**
 * Booking.com search around one hotel, nearest first, for one night. The
 * hotel comes first if Booking lists it, else the places next to it.
 * A search by name sends Booking to its home page when it has no match.
 */
export function bookingHotelUrl(opts: {
  hotel: string;
  coord: LonLat;
  /** Check-in date "YYYY-MM-DD". Without it, Booking asks for dates. */
  date?: string;
}): string {
  const [lon, lat] = opts.coord;
  const params = searchParams(opts.hotel, opts.date);
  params.splice(
    1,
    0,
    ["latitude", lat.toFixed(5)],
    ["longitude", lon.toFixed(5)],
    ["dest_type", "latlong"],
    ["order", "distance_from_search"],
  );
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
  // bahn.de reads its search from the URL fragment.
  const params: [string, string][] = [
    ["sts", "true"],
    ["so", opts.from],
    ["zo", opts.to],
  ];
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
