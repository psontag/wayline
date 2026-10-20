import { cn } from "../lib/cn";

export type DayStripItem = {
  /** Date or day number. */
  label: string;
  /** Share of a full day, 0 to 1. */
  share: number;
  /** Target, e.g. "about 35 km". */
  value: string;
  /** Why the day is short, e.g. "From 13:00". */
  note: string;
};

/** One tile per day of a trip, with a bar for its share of a full day. */
export function DayStrip({
  items,
  "aria-label": label,
}: {
  items: DayStripItem[];
  "aria-label": string;
}) {
  return (
    <ol aria-label={label} className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex min-w-0 grow basis-20 flex-col gap-1 rounded-md bg-bg p-2"
        >
          <span className="truncate text-xs font-bold">{item.label}</span>
          <span
            aria-hidden
            className="flex h-1.5 overflow-hidden rounded-full bg-hover"
          >
            <span
              className={cn(
                "h-full",
                item.share < 1 ? "bg-route-casing" : "bg-route",
              )}
              style={{ width: `${Math.round(item.share * 100)}%` }}
            />
          </span>
          <span className="text-xs tabular-nums">{item.value}</span>
          <span className="truncate text-2xs text-text-muted">{item.note}</span>
        </li>
      ))}
    </ol>
  );
}
