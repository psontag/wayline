import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { WindBar, type WindBarShares } from "./WindBar";

export type WindDateOption = {
  /** "Sat 7" */
  label: string;
  /** Headwind share of the whole trip, 0 to 1. Missing without a forecast. */
  headwind?: number;
  wind?: WindBarShares;
  current: boolean;
  /** Without it, the option can't be picked, e.g. on shared trips. */
  onSelect?: () => void;
};

/** The trip's wind on a few start dates around the planned one. */
export function WindDateStrip({
  options,
  "aria-label": ariaLabel,
}: {
  options: WindDateOption[];
  "aria-label": string;
}) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  return (
    <ul
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-1.5"
    >
      {options.map((option) => {
        const content = (
          <>
            <span className="text-xs font-bold">{option.label}</span>
            {option.wind ? (
              <WindBar shares={option.wind} className="w-full" />
            ) : (
              <span className="h-1.5 w-full rounded-full bg-hover" />
            )}
            <span className="text-2xs text-text-muted tabular-nums">
              {option.headwind === undefined
                ? t("windDates.noForecast")
                : t("windDates.headwind", {
                    share: format.percent(option.headwind),
                  })}
            </span>
          </>
        );
        return (
          <li key={option.label}>
            {option.onSelect && !option.current ? (
              <button
                type="button"
                onClick={option.onSelect}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-md border px-1.5 py-1.5 hover:bg-hover",
                  option.current
                    ? "border-selected-border bg-selected"
                    : "border-border bg-surface",
                  focusRing,
                )}
              >
                {content}
              </button>
            ) : (
              <div
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-md border px-1.5 py-1.5",
                  option.current
                    ? "border-selected-border bg-selected"
                    : "border-border bg-surface",
                )}
                aria-current={option.current || undefined}
              >
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
