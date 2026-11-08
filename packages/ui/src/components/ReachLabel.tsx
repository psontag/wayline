import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { Tooltip } from "./Tooltip";

/** Train time bands: up to 1 h, 2 h and 3 h. */
export type ReachBand = 1 | 2 | 3;

export const reachBandClasses: Record<ReachBand, string> = {
  1: "bg-reach-1",
  2: "bg-reach-2",
  3: "bg-reach-3",
};

/** Small "R": the train needs a bike reservation. */
export type Reservation = {
  /** The mark, "R". */
  mark: string;
  /** What it means. */
  label: string;
};

export function ReservationMark({ mark, label }: Reservation) {
  return (
    <abbr
      title={label}
      className="rounded-sm border border-border px-1 text-xs font-bold text-text no-underline"
    >
      {mark}
    </abbr>
  );
}

/** A station on the reach map: name, train time, changes and R. */
export function ReachLabel({
  name,
  time,
  changes,
  reservation,
}: {
  name: string;
  time: string;
  changes: string;
  /** Set if the train needs a bike reservation. */
  reservation?: Reservation;
}) {
  return (
    <span className="flex flex-col gap-0.5 rounded-sm border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap text-text shadow-sm">
      <span className="font-bold">{name}</span>
      <span className="flex items-center gap-1.5 text-text-muted tabular-nums">
        <span className="font-semibold text-text">{time}</span>
        {changes}
        {reservation && <ReservationMark {...reservation} />}
      </span>
    </span>
  );
}

/** Key for the reach colors, and what R means. */
export function ReachLegend({
  bands,
  reservation,
}: {
  bands: { band: ReachBand; label: string }[];
  /** Mark, its short name and what it means. */
  reservation: Reservation & { name: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      {bands.map(({ band, label }) => (
        <span key={band} className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-2.5 rounded-full border border-surface",
              reachBandClasses[band],
            )}
          />
          {label}
        </span>
      ))}
      <Tooltip label={reservation.label}>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-sm text-text-muted",
            focusRing,
          )}
        >
          <ReservationMark mark={reservation.mark} label={reservation.label} />
          {reservation.name}
        </button>
      </Tooltip>
    </div>
  );
}
