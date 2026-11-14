import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { type RainKind, rainFill } from "./RainStrip";

const kinds: RainKind[] = ["dry", "showers", "wet"];

export type ForecastDay = {
  /** First letter of the weekday. */
  weekday: string;
  /** Day of the month. */
  day: string;
  /** Read out instead of weekday and day, e.g. "Sat 14 Nov: 40 dry, 2 wet". */
  label: string;
  /** How many places are dry, have showers or are wet. */
  counts: Record<RainKind, number>;
  /** Far out, so the forecast is rough. Faded. */
  rough?: boolean;
  weekend?: boolean;
  /** Part of the trip. */
  selected?: boolean;
};

/** The forecast days side by side, each with a bar of dry, showers and wet. */
export function ForecastDays({
  days,
  onPick,
  "aria-label": label,
}: {
  days: ForecastDay[];
  onPick: (index: number) => void;
  "aria-label": string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-0.5"
    >
      {days.map((day, i) => {
        const total = day.counts.dry + day.counts.showers + day.counts.wet || 1;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={!!day.selected}
            aria-label={day.label}
            title={day.label}
            onClick={() => onPick(i)}
            className={cn(
              "flex min-w-0 flex-col items-center gap-0.5 rounded-md border-2 py-1 text-2xs tabular-nums",
              day.selected
                ? "border-selected-border bg-selected"
                : "border-transparent hover:bg-hover",
              day.weekend ? "font-bold text-text" : "text-text-muted",
              focusRing,
            )}
          >
            <span aria-hidden>{day.weekday}</span>
            <span
              aria-hidden
              className={cn(
                "flex h-10 w-2 flex-col-reverse overflow-hidden rounded-sm bg-hover",
                day.rough && "opacity-50",
              )}
            >
              {kinds.map((kind) => (
                <span
                  key={kind}
                  className={rainFill(kind)}
                  style={{ height: `${(day.counts[kind] / total) * 100}%` }}
                />
              ))}
            </span>
            <span aria-hidden>{day.day}</span>
          </button>
        );
      })}
    </div>
  );
}
