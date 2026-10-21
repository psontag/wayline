import {
  addDays,
  dayShares,
  GenerateRequest,
  HotelBudget,
  IsoDate,
  Place,
  Profile,
  Theme,
  TimeOfDay,
  type TripKind,
} from "@wayline/domain";
import { z } from "zod";

export const lengths = ["one", "multi"] as const;
export type TripLength = (typeof lengths)[number];
export const shapes = ["ab", "loop"] as const;
export type TripShape = (typeof shapes)[number];

/** Theme choices on the form. "any" means no theme. */
export const themes = ["any", ...Theme.options] as const;
export type ThemeChoice = (typeof themes)[number];

export const formErrors = [
  "startRequired",
  "endRequired",
  "endSameAsStart",
  "lastDay",
  "kmPerDay",
  "maxAscentPerDay",
] as const;
export type FormError = (typeof formErrors)[number];

export const limits = {
  days: { min: 2, max: 14 },
  kmPerDay: { min: 20, max: 250 },
  maxAscentPerDay: { min: 100, max: 5000 },
} as const;

const whole = (key: FormError, { min, max }: { min: number; max: number }) =>
  z.number(key).int(key).min(min, key).max(max, key);

/** Days from the first to the last day, both included. */
export function dayCount(first: string, last: string): number {
  const ms = Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export const newTripSchema = z
  .object({
    length: z.enum(lengths),
    shape: z.enum(shapes),
    start: Place.nullable().refine((p) => p !== null, "startRequired"),
    end: Place.nullable(),
    startDate: IsoDate,
    startTime: TimeOfDay,
    endDate: IsoDate,
    backBy: TimeOfDay,
    kmPerDay: whole("kmPerDay", limits.kmPerDay),
    maxAscentPerDay: whole("maxAscentPerDay", limits.maxAscentPerDay),
    profile: Profile,
    hotelBudget: HotelBudget,
    theme: z.enum(themes),
  })
  .superRefine((v, ctx) => {
    if (v.length === "multi") {
      const days = dayCount(v.startDate, v.endDate);
      if (days < limits.days.min || days > limits.days.max) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "lastDay" });
      }
    }
    if (v.shape !== "ab") return;
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
  length: TripLength;
  shape: TripShape;
  start: Place | null;
  end: Place | null;
  startDate: string;
  startTime: string;
  /** Last day of a trip over several days. */
  endDate: string;
  /** Latest arrival on the last day. */
  backBy: string;
  /** Km per day, or the distance of a one-day trip. */
  kmPerDay: number | undefined;
  maxAscentPerDay: number | undefined;
  profile: Profile;
  hotelBudget: HotelBudget;
  theme: ThemeChoice;
};

/** Length and shape for a trip kind. */
export function fromKind(kind?: TripKind): {
  length: TripLength;
  shape: TripShape;
} {
  if (kind === "day-loop") return { length: "one", shape: "loop" };
  if (kind === "multi-day-loop") return { length: "multi", shape: "loop" };
  if (kind === "route") return { length: "one", shape: "ab" };
  return { length: "multi", shape: "ab" };
}

export function toKind(length: TripLength, shape: TripShape) {
  if (shape === "ab") return "one-way" as const;
  return length === "one" ? ("day-loop" as const) : ("multi-day-loop" as const);
}

/** Days of the trip in the form. One for a one-day trip. */
export function formDays(v: NewTripValues): number {
  return v.length === "one" ? 1 : dayCount(v.startDate, v.endDate);
}

/** Bamberg to Coburg in three days: works well on the test network. */
export function defaultValues(
  places: Place[],
  today: string,
  kind?: TripKind,
): NewTripValues {
  const town = (name: string) =>
    places.find((p) => p.kind === "town" && p.name === name) ??
    places.find((p) => p.name === name) ??
    null;
  const startDate = addDays(today, 7);
  return {
    ...fromKind(kind),
    start: town("Bamberg"),
    end: town("Coburg"),
    startDate,
    startTime: "09:00",
    endDate: addDays(startDate, 2),
    backBy: "17:00",
    kmPerDay: 70,
    maxAscentPerDay: 900,
    profile: "touring",
    hotelBudget: "mid",
    theme: "any",
  };
}

/** Form values for an earlier request. Keeps defaults for missing fields. */
export function fromRequest(
  request: GenerateRequest,
  defaults: NewTripValues,
): NewTripValues {
  const startDate = request.startDate ?? defaults.startDate;
  const { length, shape } =
    request.kind === "one-way"
      ? fromKind(request.days === 1 ? "route" : "one-way")
      : fromKind(request.kind);
  return {
    length,
    shape,
    start: request.startStation ?? defaults.start,
    end: request.endStation ?? (shape === "ab" ? null : defaults.end),
    startDate,
    startTime: request.startTime,
    endDate: addDays(startDate, Math.max(1, request.days - 1)),
    backBy: request.backBy ?? defaults.backBy,
    kmPerDay: request.kmPerDay,
    maxAscentPerDay: request.maxAscentPerDay,
    profile: request.profile,
    hotelBudget: request.hotelBudget ?? defaults.hotelBudget,
    theme: request.theme ?? "any",
  };
}

export function toRequest(values: NewTripValues): GenerateRequest {
  const v = newTripSchema.parse(values);
  const days = formDays(values);
  const multi = v.length === "multi";
  return GenerateRequest.parse({
    kind: toKind(v.length, v.shape),
    startStation: v.start,
    endStation: v.shape === "ab" ? v.end : undefined,
    days,
    kmPerDay: v.kmPerDay,
    maxAscentPerDay: v.maxAscentPerDay,
    profile: v.profile,
    hotelBudget: multi ? v.hotelBudget : undefined,
    theme: v.theme === "any" ? undefined : v.theme,
    startDate: v.startDate,
    startTime: v.startTime,
    ...(multi
      ? {
          backBy: v.backBy,
          dayShares: dayShares(days, v.startTime, v.backBy),
        }
      : {}),
  });
}

export function isFormError(message: unknown): message is FormError {
  return formErrors.includes(message as FormError);
}

function sameCoord(a: Place, b: Place) {
  return a.coord[0] === b.coord[0] && a.coord[1] === b.coord[1];
}

/** Times to pick from, every half hour. */
export const times = (from: number, to: number) =>
  Array.from({ length: (to - from) * 2 + 1 }, (_, i) => {
    const minutes = from * 60 + i * 30;
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    return `${h}:${m}`;
  });

export const startTimes = times(5, 16);
export const backByTimes = times(10, 21);
