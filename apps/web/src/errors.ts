import { type ErrorCode, WaylineError } from "@wayline/domain";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

/** The button an error offers. */
export type ErrorAction = "retry" | "reload" | "login" | "back";

export type ErrorText = {
  title: string;
  text: string;
  action: ErrorAction;
  /** Label of the action button. */
  actionLabel: string;
};

/** The code of an error. Anything that is not a WaylineError is a bug. */
export function errorCode(error: unknown): ErrorCode {
  return error instanceof WaylineError ? error.code : "INTERNAL";
}

const actions: Record<ErrorCode, ErrorAction> = {
  PROVIDER_UNAVAILABLE: "retry",
  RATE_LIMITED: "retry",
  NOT_FOUND: "back",
  CONFLICT: "reload",
  INVALID: "retry",
  UNAUTHORIZED: "login",
  OFFLINE: "retry",
  INTERNAL: "retry",
};

// These fail the same way again. Offline retries wait for the connection.
const final = new Set<ErrorCode>([
  "NOT_FOUND",
  "UNAUTHORIZED",
  "INVALID",
  "CONFLICT",
  "RATE_LIMITED",
]);

/** Retry rule for TanStack Query: at most 2 retries, none for final errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && !final.has(errorCode(error));
}

/**
 * What to tell the user about an error.
 * `thing` names what could not be reached, e.g. "the router".
 */
export function errorText(
  t: TFunction<"common">,
  error: unknown,
  thing?: string,
): ErrorText {
  const code = errorCode(error);
  const action = actions[code];
  return {
    title: t(`errors.${code}.title`, { thing: thing ?? t("errors.thing") }),
    text: t(`errors.${code}.text`),
    action,
    actionLabel: t(`errors.action.${action}`),
  };
}

/** errorText with the app's translations. */
export function useErrorText() {
  const { t } = useTranslation("common");
  return (error: unknown, thing?: string) => errorText(t, error, thing);
}
