import { type ErrorCode, WaylineError } from "@wayline/domain";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

/** The button an error offers. */
export type ErrorAction = "retry" | "reload" | "login" | "back";

/** An error code, or UPDATE when a new version replaced the loaded code. */
export type ErrorKind = ErrorCode | "UPDATE";

export type ErrorText = {
  kind: ErrorKind;
  title: string;
  text: string;
  action: ErrorAction;
  /** Label of the action button. */
  actionLabel: string;
};

/** A lazy screen whose file is gone, usually after a deploy. */
function isStaleBundle(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /dynamically imported module|importing a module script/i.test(error.message)
  );
}

const offline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

/** The code of an error. Anything that is not a WaylineError is a bug. */
export function errorCode(error: unknown): ErrorCode {
  if (error instanceof WaylineError) return error.code;
  if (isStaleBundle(error) && offline()) return "OFFLINE";
  return "INTERNAL";
}

export function errorKind(error: unknown): ErrorKind {
  const code = errorCode(error);
  return code === "INTERNAL" && isStaleBundle(error) ? "UPDATE" : code;
}

const actions: Record<ErrorKind, ErrorAction> = {
  UPDATE: "reload",
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
  const kind = errorKind(error);
  const action = actions[kind];
  return {
    kind,
    title: t(`errors.${kind}.title`, { thing: thing ?? t("errors.thing") }),
    text: t(`errors.${kind}.text`),
    action,
    actionLabel: t(`errors.action.${action}`),
  };
}

/**
 * One sentence for an inline error or a toast, e.g. "Could not save the
 * trip. You're offline." `what` is "Could not …" without a period.
 * With `retryButton`, it leaves out "Try again", which the button says.
 */
export function failedText(
  t: TFunction<"common">,
  what: string,
  error: unknown,
  retryButton = false,
): string {
  const kind = errorKind(error);
  if (
    kind === "OFFLINE" ||
    kind === "UNAUTHORIZED" ||
    kind === "RATE_LIMITED"
  ) {
    return t("errors.failed", { what, reason: t(`errors.${kind}.title`) });
  }
  return retryButton
    ? t("errors.failedPlain", { what })
    : t("errors.failed", { what, reason: t("errors.action.retry") });
}

/** failedText with the app's translations. */
export function useFailedText() {
  const { t } = useTranslation("common");
  return (what: string, error: unknown, retryButton?: boolean) =>
    failedText(t, what, error, retryButton);
}

/** errorText with the app's translations. */
export function useErrorText() {
  const { t } = useTranslation("common");
  return (error: unknown, thing?: string) => errorText(t, error, thing);
}
