import { z } from "zod";

// Units: distances in meters, elevation in meters, speed in km/h,
// temperatures in °C. Dates are "YYYY-MM-DD", times "HH:MM", local times
// "YYYY-MM-DDTHH:MM" (local to the trip, no time zone).

/** [lon, lat] */
export const LonLat = z.tuple([z.number(), z.number()]);
export type LonLat = z.infer<typeof LonLat>;

/** [west, south, east, north] */
export const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type BBox = z.infer<typeof BBox>;

export const IsoDate = z.iso.date();
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const TripKind = z.enum([
  "one-way",
  "multi-day-loop",
  "route",
  "day-loop",
]);
export type TripKind = z.infer<typeof TripKind>;

export const Profile = z.enum(["touring", "fast", "scenic", "quiet"]);
export type Profile = z.infer<typeof Profile>;

/** What a generated trip should lean toward. None means no preference. */
export const Theme = z.enum(["nature", "water", "wine", "culture"]);
export type Theme = z.infer<typeof Theme>;

/** Up to €80, €80–140, €140+ */
export const HotelBudget = z.enum(["low", "mid", "high"]);
export type HotelBudget = z.infer<typeof HotelBudget>;

/** Share of the distance per surface type, each 0 to 1. */
export const Surface = z.object({
  paved: z.number().min(0).max(1),
  gravel: z.number().min(0).max(1),
  unpaved: z.number().min(0).max(1),
});
export type Surface = z.infer<typeof Surface>;

export const PlaceKind = z.enum([
  "station",
  "town",
  "junction",
  "hotel",
  "custom",
]);
export type PlaceKind = z.infer<typeof PlaceKind>;

/** Snapshot of a place. osmId is only a hint. */
export const Place = z.object({
  name: z.string(),
  kind: PlaceKind,
  coord: LonLat,
  osmId: z.string().optional(),
});
export type Place = z.infer<typeof Place>;

/** Place at a stage end. */
export const Stop = Place.extend({
  locked: z.boolean(),
  /** Other towns that work as this stop. */
  alternatives: z.array(Place).default([]),
});
export type Stop = z.infer<typeof Stop>;

/** Snapshot of an OSM hotel. */
export const Hotel = z.object({
  osmId: z.string(),
  name: z.string(),
  coord: LonLat,
  stars: z.number().optional(),
  website: z.string().optional(),
});
export type Hotel = z.infer<typeof Hotel>;

/** One train connection, e.g. from home to the start. */
export const Connection = z.object({
  /** "there": home to the start. "back": the end to home. */
  direction: z.enum(["there", "back"]),
  from: z.string(),
  to: z.string(),
  /** Local time "YYYY-MM-DDTHH:MM" */
  departure: z.string(),
  arrival: z.string(),
  changes: z.number().int().nonnegative(),
  /** Line names in order, e.g. ["ICE 591", "RE 4"]. */
  lines: z.array(z.string()),
});
export type Connection = z.infer<typeof Connection>;

export const Stats = z.object({
  distance: z.number().nonnegative(),
  ascent: z.number().nonnegative(),
  descent: z.number().nonnegative(),
  surface: Surface,
});
export type Stats = z.infer<typeof Stats>;

/** Route between two consecutive points of a stage. */
export const Leg = z.object({
  from: LonLat,
  to: LonLat,
  /** Encoded polyline, 5 decimals. Decode with decodeLine(). */
  geometry: z.string(),
  /** Meters, one per geometry point. */
  elevation: z.array(z.number()),
  distance: z.number().nonnegative(),
  ascent: z.number().nonnegative(),
  descent: z.number().nonnegative(),
  surface: Surface,
  provider: z.string(),
  profileHash: z.string(),
});
export type Leg = z.infer<typeof Leg>;

/** Provider answer as the Worker returns and caches it. The browser parses raw. */
export const ProviderEnvelope = z.object({
  provider: z.string(),
  profileHash: z.string(),
  raw: z.unknown(),
});
export type ProviderEnvelope = z.infer<typeof ProviderEnvelope>;

/** Body of POST /api/route: one leg. */
export const RouteRequest = z.object({
  from: LonLat,
  to: LonLat,
  profile: Profile,
});
export type RouteRequest = z.infer<typeof RouteRequest>;

export const Stage = z.object({
  id: z.string(),
  start: Place,
  end: Stop,
  via: z.array(Place).default([]),
  /** Empty on the last stage. */
  hotel: Hotel.optional(),
  legs: z.array(Leg),
  stats: Stats,
});
export type Stage = z.infer<typeof Stage>;

export const Settings = z.object({
  profile: Profile,
  kmPerDay: z.number().positive(),
  maxAscentPerDay: z.number().positive(),
  hotelBudget: HotelBudget.optional(),
  /** Start on the first day. Later days start at DAY_START. */
  startTime: TimeOfDay.default("09:00"),
  /** Latest arrival on the last day. */
  backBy: TimeOfDay.optional(),
  /**
   * Share of a full day per stage, 0.25 to 1. Targets for km and ascent
   * scale with it. Missing means full days.
   */
  dayShares: z.array(z.number().min(0).max(1)).optional(),
  avgSpeed: z.number().positive().default(18),
  /**
   * Ride start per stage, as chosen in the weather timeline. Null or
   * missing uses stageStartTime's default.
   */
  rideStarts: z.array(TimeOfDay.nullable()).optional(),
});
export type Settings = z.infer<typeof Settings>;

export const TRIP_SCHEMA_VERSION = 1;

export const Trip = z.object({
  schemaVersion: z.literal(TRIP_SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  createdAt: z.iso.datetime(),
  /** Conflict check on save. */
  updatedAt: z.iso.datetime(),
  kind: TripKind,
  /** Without it, no dates or weather. */
  startDate: IsoDate.optional(),
  settings: Settings,
  stages: z.array(Stage),
  /** Stages as proposed. A changed stage can go back to its proposal. */
  proposed: z.array(Stage).optional(),
  sharedWith: z.array(z.string()).default([]),
  /** Saved train connections, a few options per direction. */
  trains: z.array(Connection).default([]),
});
export type Trip = z.infer<typeof Trip>;

/** Body of PUT /api/trips/:id/shares: everyone who can view the trip. */
export const Shares = z.object({
  emails: z.array(z.email().toLowerCase()).max(50),
});
export type Shares = z.infer<typeof Shares>;

export const WeatherSample = z.object({
  /** Local time "YYYY-MM-DDTHH:MM" */
  time: z.string(),
  temperature: z.number(),
  /** mm in this hour */
  precipitation: z.number().nonnegative(),
  /** 0 to 1 */
  precipitationProbability: z.number().min(0).max(1),
  windSpeed: z.number().nonnegative(),
  /** Degrees the wind comes from. 0 = north, 90 = east. */
  windDirection: z.number().min(0).max(360),
  /** Feels-like temperature, with wind and humidity. */
  apparentTemperature: z.number(),
  /** km/h, strongest gust in this hour. */
  windGusts: z.number().nonnegative(),
});
export type WeatherSample = z.infer<typeof WeatherSample>;

/** Local times "YYYY-MM-DDTHH:MM" of one day. */
export const Daylight = z.object({
  date: IsoDate,
  sunrise: z.string(),
  sunset: z.string(),
});
export type Daylight = z.infer<typeof Daylight>;

// --- Generation -----------------------------------------------------------

export const GenerateRequest = z
  .object({
    kind: z.enum(["one-way", "multi-day-loop", "day-loop"]),
    /** Map area to search in. */
    region: BBox.optional(),
    /** Start station. Loops start and end here. */
    startStation: Place.optional(),
    /** One-way only. Without it, the generator picks the end. */
    endStation: Place.optional(),
    days: z.number().int().min(1).max(14),
    kmPerDay: z.number().positive(),
    maxAscentPerDay: z.number().positive(),
    profile: Profile,
    hotelBudget: HotelBudget.optional(),
    theme: Theme.optional(),
    startDate: IsoDate.optional(),
    startTime: TimeOfDay.default("09:00"),
    backBy: TimeOfDay.optional(),
    /** Share of a full day per stage. Missing means full days. */
    dayShares: z.array(z.number().min(0).max(1)).optional(),
  })
  .refine((r) => r.region || r.startStation, {
    message: "Needs a region or a start station",
  });
export type GenerateRequest = z.infer<typeof GenerateRequest>;

/** What sets a one-day A to B proposal apart. */
export const ProposalCharacter = z.enum(["direct", "scenic", "longer"]);
export type ProposalCharacter = z.infer<typeof ProposalCharacter>;

/** What sets a multi-day or loop proposal apart. */
export const Flavour = z.enum(["best", "nature", "flat", "hilly", "sights"]);
export type Flavour = z.infer<typeof Flavour>;

export const Proposal = z.object({
  id: z.string(),
  /** Draft trip. Not saved until the user opens it. */
  trip: Trip,
  /** Higher is better. */
  score: z.number(),
  /** Main signed routes, longest first. */
  routeNames: z.array(z.string()),
  /** Best-known towns on the way, in route order. */
  via: z.array(z.string()),
  /** Share of km with each theme. Missing without scenery data. */
  themes: z.partialRecord(Theme, z.number()).optional(),
  character: ProposalCharacter.optional(),
  flavour: Flavour.optional(),
  /** 0 to 1: share of km on signed cycle routes. */
  signedShare: z.number().optional(),
});
export type Proposal = z.infer<typeof Proposal>;

export const GeneratePhase = z.enum([
  "loading",
  "searching",
  "cutting",
  "routing",
]);
export type GeneratePhase = z.infer<typeof GeneratePhase>;

/** "routing 3 of 5". done and total are 0 when a phase has no count. */
export const GenerateProgress = z.object({
  phase: GeneratePhase,
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type GenerateProgress = z.infer<typeof GenerateProgress>;

/** The limit to relax when nothing fits. */
export const FailedLimit = z.enum([
  "area",
  "days",
  "kmPerDay",
  "maxAscentPerDay",
  "hotels",
]);
export type FailedLimit = z.infer<typeof FailedLimit>;

export const GenerateResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), proposals: z.array(Proposal) }),
  z.object({ ok: z.literal(false), failedLimit: FailedLimit }),
]);
export type GenerateResult = z.infer<typeof GenerateResult>;
