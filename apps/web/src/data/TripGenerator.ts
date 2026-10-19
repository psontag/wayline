import type {
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  Proposal,
} from "@wayline/domain";

export type GenerateOptions = {
  onProgress?: (progress: GenerateProgress) => void;
  /** Called for each proposal as soon as it is ready. */
  onProposal?: (proposal: Proposal) => void;
  /** Aborting rejects the promise with an AbortError. */
  signal?: AbortSignal;
};

/** Turns a request into trip proposals. See docs/05-trip-generation.md. */
export interface TripGenerator {
  generate(
    request: GenerateRequest,
    options?: GenerateOptions,
  ): Promise<GenerateResult>;
}
