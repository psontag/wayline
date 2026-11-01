import type {
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  HourlyWind,
  Proposal,
} from "@wayline/domain";

export type GenerateOptions = {
  onProgress?: (progress: GenerateProgress) => void;
  /** Called for each proposal as soon as it is ready. */
  onProposal?: (proposal: Proposal) => void;
  /** Aborting rejects the promise with an AbortError. */
  signal?: AbortSignal;
  /** Hourly wind of the start date, for day trips with the wind. */
  wind?: HourlyWind[];
};

/** Turns a request into trip proposals. See docs/05-trip-generation.md. */
export interface TripGenerator {
  generate(
    request: GenerateRequest,
    options?: GenerateOptions,
  ): Promise<GenerateResult>;
}
