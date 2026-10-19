import { z } from "zod";

/** Error codes shared by the API and local implementations. */
export const ErrorCode = z.enum([
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  code: ErrorCode,
  message: z.string(),
  /** Seconds */
  retryAfter: z.number().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export class WaylineError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "WaylineError";
  }
}

export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof WaylineError && error.code === code;
}
