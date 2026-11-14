import { cn } from "../lib/cn";

/** Rain over the riding hours of a day. See docs/06-ui.md, Weather. */
export type RainKind = "dry" | "showers" | "wet";

const fill: Record<RainKind, string> = {
  dry: "bg-weather-dry",
  showers: "bg-weather-showers",
  wet: "bg-weather-wet",
};

export type RainStripDay = {
  /** Missing without a forecast. */
  rain?: RainKind;
  /** Far out, so the forecast is rough. Faded. */
  rough?: boolean;
  /** Part of the trip. Underlined. */
  selected?: boolean;
};

/** One small bar per forecast day, colored by rain. */
export function RainStrip({
  days,
  size = "sm",
  "aria-label": label,
  className,
}: {
  days: RainStripDay[];
  /** md for a single place, sm inside a list row. */
  size?: "sm" | "md";
  "aria-label": string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("grid auto-cols-fr grid-flow-col gap-px", className)}
    >
      {days.map((day, i) => (
        <span key={i} className="flex flex-col gap-0.5">
          <span
            className={cn(
              "rounded-sm",
              size === "sm" ? "h-1" : "h-3",
              day.rain ? fill[day.rain] : "bg-hover",
              day.rough && "opacity-50",
            )}
          />
          <span
            className={cn(
              "h-0.5 rounded-full",
              day.selected ? "bg-selected-border" : "bg-transparent",
            )}
          />
        </span>
      ))}
    </span>
  );
}

/** Small dot for the rain of a place over the trip days. */
export function RainDot({ rain }: { rain: RainKind | undefined }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        rain ? fill[rain] : "bg-hover",
      )}
    />
  );
}

export function rainFill(rain: RainKind): string {
  return fill[rain];
}

/** Key for the rain colors. */
export function RainLegend({
  labels,
  over,
}: {
  labels: Record<RainKind, string>;
  /** Label for places without a color, e.g. over the max train time. */
  over?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      {(Object.keys(fill) as RainKind[]).map((kind) => (
        <span key={kind} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 shrink-0 rounded-sm", fill[kind])} />
          {labels[kind]}
        </span>
      ))}
      {over && (
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm border border-border bg-surface" />
          {over}
        </span>
      )}
    </div>
  );
}
