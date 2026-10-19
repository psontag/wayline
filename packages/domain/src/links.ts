import type { HotelBudget } from "./schema";
import { addDays } from "./time";

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
  const params: [string, string][] = [["ss", opts.town]];
  if (opts.date) {
    params.push(["checkin", opts.date], ["checkout", addDays(opts.date, 1)]);
  }
  params.push(["group_adults", "1"], ["no_rooms", "1"]);
  const filters = [
    opts.minRating && `review_score=${opts.minRating}`,
    opts.budget && `price=${budgetPrice[opts.budget]}`,
  ].filter(Boolean);
  if (filters.length) params.push(["nflt", filters.join(";")]);
  return `https://www.booking.com/searchresults.html?${query(params)}`;
}

/** bahn.de connection search between two stations. */
export function bahnUrl(opts: {
  from: string;
  to: string;
  /** Local time "YYYY-MM-DDTHH:MM". Departure at this time. */
  time?: string;
}): string {
  // bahn.de reads its search from the URL fragment.
  const params: [string, string][] = [
    ["sts", "true"],
    ["so", opts.from],
    ["zo", opts.to],
  ];
  if (opts.time) params.push(["hd", `${opts.time}:00`], ["hza", "D"]);
  return `https://www.bahn.de/buchung/fahrplan/suche#${query(params)}`;
}

function query(params: [string, string][]): string {
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
