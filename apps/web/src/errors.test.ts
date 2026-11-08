import { WaylineError } from "@wayline/domain";
import i18n from "i18next";
import { describe, expect, it } from "vitest";
import {
  errorCode,
  errorKind,
  errorText,
  failedText,
  shouldRetry,
} from "./errors";
import "./i18n";

const t = i18n.getFixedT("en", "common");

describe("errorCode", () => {
  it("treats unknown errors as bugs", () => {
    expect(errorCode(new WaylineError("CONFLICT"))).toBe("CONFLICT");
    expect(errorCode(new Error("boom"))).toBe("INTERNAL");
  });
});

describe("shouldRetry", () => {
  it("retries errors that can heal, at most twice", () => {
    const down = new WaylineError("PROVIDER_UNAVAILABLE");
    expect(shouldRetry(0, down)).toBe(true);
    expect(shouldRetry(1, down)).toBe(true);
    expect(shouldRetry(2, down)).toBe(false);
    expect(shouldRetry(0, new WaylineError("OFFLINE"))).toBe(true);
  });

  it("never retries final errors", () => {
    for (const code of [
      "NOT_FOUND",
      "UNAUTHORIZED",
      "INVALID",
      "CONFLICT",
      "RATE_LIMITED",
    ] as const) {
      expect(shouldRetry(0, new WaylineError(code))).toBe(false);
    }
  });
});

describe("errorKind", () => {
  it("spots a lazy screen that is gone after a deploy", () => {
    const stale = new TypeError("Failed to fetch dynamically imported module");
    expect(errorKind(stale)).toBe("UPDATE");
    expect(errorText(t, stale).action).toBe("reload");
    expect(errorKind(new TypeError("x is undefined"))).toBe("INTERNAL");
  });
});

describe("failedText", () => {
  it("gives the reason when the user can act on it", () => {
    const what = "Could not save the trip";
    expect(failedText(t, what, new WaylineError("OFFLINE"))).toBe(
      "Could not save the trip. You're offline.",
    );
    expect(failedText(t, what, new Error("boom"))).toBe(
      "Could not save the trip. Try again.",
    );
    expect(failedText(t, what, new Error("boom"), true)).toBe(
      "Could not save the trip.",
    );
  });
});

describe("errorText", () => {
  it("names the thing that could not be reached", () => {
    const text = errorText(
      t,
      new WaylineError("PROVIDER_UNAVAILABLE"),
      "the router",
    );
    expect(text).toMatchObject({
      title: "Could not reach the router",
      action: "retry",
      actionLabel: "Try again",
    });
  });

  it("offers the matching action", () => {
    expect(errorText(t, new WaylineError("NOT_FOUND")).action).toBe("back");
    expect(errorText(t, new WaylineError("CONFLICT")).action).toBe("reload");
    expect(errorText(t, new WaylineError("UNAUTHORIZED")).action).toBe("login");
    expect(errorText(t, new Error("boom")).title).toBe("Something went wrong");
  });
});
