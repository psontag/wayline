import {
  addDays,
  GenerateRequest,
  HotelBudget,
  IsoDate,
  Place,
  Profile,
  TimeOfDay,
  type TripKind,
} from "@wayline/domain";
import { z } from "zod";

export const tripKinds = ["one-way", "multi-day-loop"] as const;
export type NewTripKind = (typeof tripKinds)[number];

export const formErrors = [
  "startRequired",
  "endRequired",
  "endSameAsStart",
  "days",
  "kmPerDay",
  "maxAscentPerDay",
] as const;
export type FormError = (typeof formErrors)[number];

export const limits = {
  days: { min: 1, max: 14 },
  kmPerDay: { min: 20, max: 250 },
  maxAscentPerDay: { min: 100, max: 5000 },
} as const;

const whole = (key: FormError, { min, max }: { min: number; max: number }) =>
  z.number(key).int(key).min(min, key).max(max, key);

export const newTripSchema = z
  .object({
    kind: z.enum(tripKinds),
    start: Place.nullable().refine((p) => p !== null, "startRequired"),
    end: Place.nullable(),
    days: whole("days", limits.days),
    kmPerDay: whole("kmPerDay", limits.kmPerDay),
    maxAscentPerDay: whole("maxAscentPerDay", limits.maxAscentPerDay),
    profile: Profile,
    hotelBudget: HotelBudget,
    /** "" for no date. */
    startDate: z.union([z.literal(""), IsoDate]),
    startTime: TimeOfDay,
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "one-way") return;
    if (!v.end) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "endRequired" });
    } else if (v.start && sameCoord(v.start, v.end)) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "endSameAsStart",
      });
    }
  });

export type NewTripValues = {
  kind: NewTripKind;
  start: Place | null;
  end: Place | null;
  days: number | undefined;
  kmPerDay: number | undefined;
  maxAscentPerDay: number | undefined;
  profile: Profile;
  hotelBudget: HotelBudget;
  startDate: string;
  startTime: string;
};

/** Bamberg to Coburg in three days: works well on the test network. */
export function defaultValues(
  places: Place[],
  today: string,
  kind?: TripKind,
): NewTripValues {
  const station = (name: string) =>
    places.find((p) => p.kind === "station" && p.name === name) ?? null;
  return {
    kind: kind === "multi-day-loop" ? "multi-day-loop" : "one-way",
    start: station("Bamberg"),
    end: station("Coburg"),
    days: 3,
    kmPerDay: 70,
    maxAscentPerDay: 900,
    profile: "touring",
    hotelBudget: "mid",
    startDate: addDays(today, 7),
    startTime: "09:00",
  };
}

export function toRequest(values: NewTripValues): GenerateRequest {
  const v = newTripSchema.parse(values);
  return GenerateRequest.parse({
    kind: v.kind,
    startStation: v.start,
    endStation: v.kind === "one-way" ? v.end : undefined,
    days: v.days,
    kmPerDay: v.kmPerDay,
    maxAscentPerDay: v.maxAscentPerDay,
    profile: v.profile,
    hotelBudget: v.hotelBudget,
    startDate: v.startDate || undefined,
    startTime: v.startTime,
  });
}

export function isFormError(message: unknown): message is FormError {
  return formErrors.includes(message as FormError);
}

function sameCoord(a: Place, b: Place) {
  return a.coord[0] === b.coord[0] && a.coord[1] === b.coord[1];
}

/** Start times to pick from, every half hour. */
export const startTimes = Array.from({ length: 15 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
});
