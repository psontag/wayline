import type { GenerateRequest, LonLat, Place } from "@wayline/domain";

export type BenchTrip = { name: string; request: GenerateRequest };

const station = (name: string, coord: LonLat): Place => ({
  name,
  kind: "station",
  coord,
});
const heidelberg = station("Heidelberg", [8.675, 49.403]);
const bamberg = station("Bamberg", [10.9, 49.9]);
const wuerzburg = station("Würzburg", [9.936, 49.802]);
const koeln = station("Köln", [6.959, 50.943]);
const bonn = station("Bonn", [7.097, 50.732]);

const base = { hotelBudget: "mid", startTime: "09:00" } as const;

/** One or two trips per kind, small and large areas. Needs the Germany data. */
export const TRIPS: BenchTrip[] = [
  {
    name: "Loop Heidelberg 3×70",
    request: {
      ...base,
      kind: "multi-day-loop",
      startStation: heidelberg,
      days: 3,
      kmPerDay: 70,
      maxAscentPerDay: 900,
    },
  },
  {
    name: "Loop Bamberg 3×60",
    request: {
      ...base,
      kind: "multi-day-loop",
      startStation: bamberg,
      days: 3,
      kmPerDay: 60,
      maxAscentPerDay: 800,
    },
  },
  {
    name: "One-way Köln 4×70",
    request: {
      ...base,
      kind: "one-way",
      startStation: koeln,
      days: 4,
      kmPerDay: 70,
      maxAscentPerDay: 800,
    },
  },
  {
    name: "Würzburg to Bamberg 3×70",
    request: {
      ...base,
      kind: "one-way",
      startStation: wuerzburg,
      endStation: bamberg,
      days: 3,
      kmPerDay: 70,
      maxAscentPerDay: 900,
    },
  },
  {
    name: "Würzburg to Bamberg 170",
    request: {
      ...base,
      kind: "one-way",
      startStation: wuerzburg,
      endStation: bamberg,
      days: 1,
      kmPerDay: 170,
      maxAscentPerDay: 1200,
    },
  },
  {
    name: "Köln to Bonn 45",
    request: {
      ...base,
      kind: "one-way",
      startStation: koeln,
      endStation: bonn,
      days: 1,
      kmPerDay: 45,
      maxAscentPerDay: 500,
    },
  },
  {
    name: "Day loop Heidelberg 60",
    request: {
      ...base,
      kind: "day-loop",
      startStation: heidelberg,
      days: 1,
      kmPerDay: 60,
      maxAscentPerDay: 700,
    },
  },
  {
    name: "Open ride Bamberg 80",
    request: {
      ...base,
      kind: "one-way",
      startStation: bamberg,
      days: 1,
      kmPerDay: 80,
      maxAscentPerDay: 800,
    },
  },
];
