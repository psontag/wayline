import { TrainFront } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type StopMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Day number of the stage that ends here. */
  day: number;
  /** Place name next to the marker. */
  name?: string;
  selected?: boolean;
};

/** Numbered stop on the map. */
export function StopMarker({
  day,
  name,
  selected = false,
  className,
  ...props
}: StopMarkerProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1.5 rounded-full",
        focusRing,
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full border-2 text-sm font-extrabold tabular-nums shadow-sm",
          selected
            ? "border-route-casing bg-accent text-on-accent"
            : "border-marker bg-surface text-text",
        )}
      >
        {day}
      </span>
      {name && <MarkerLabel>{name}</MarkerLabel>}
    </button>
  );
}

/** Start or end of a trip, with a train icon at stations. */
export function EndpointMarker({
  name,
  station = false,
}: {
  name?: string;
  station?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex size-6 items-center justify-center rounded-md bg-marker text-surface shadow-sm">
        {station ? (
          <TrainFront className="size-3.5" aria-hidden />
        ) : (
          <span className="size-2 rounded-full bg-surface" />
        )}
      </span>
      {name && <MarkerLabel>{name}</MarkerLabel>}
    </span>
  );
}

export type AlternativeMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & { label: string };

/** Another town that works as the stop. Dashed, so it reads as an option. */
export function AlternativeMarker({
  label,
  className,
  ...props
}: AlternativeMarkerProps) {
  return (
    <button
      type="button"
      className={cn(
        "group flex items-center gap-1.5 rounded-full",
        focusRing,
        className,
      )}
      {...props}
    >
      <span className="size-4 rounded-full border-2 border-dashed border-text-muted bg-surface/60 transition-colors group-hover:border-text" />
      <MarkerLabel muted>{label}</MarkerLabel>
    </button>
  );
}

export type ViaMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
>;

/** Via point on the route. Give it an aria-label that says what a click does. */
export function ViaMarker({ className, ...props }: ViaMarkerProps) {
  return (
    <button
      type="button"
      className={cn("group rounded-full p-1", focusRing, className)}
      {...props}
    >
      <span className="block size-3.5 rounded-full border-2 border-via-point bg-surface shadow-sm transition-colors group-hover:bg-via-point" />
    </button>
  );
}

/** Where a via point lands while the route is dragged. */
export function GhostViaMarker() {
  return (
    <span className="block size-3.5 rounded-full border-2 border-via-point bg-surface/70 shadow-sm" />
  );
}

/** Point on the route that follows the elevation crosshair. */
export function HoverMarker() {
  return (
    <span className="block size-3.5 rounded-full border-2 border-surface bg-marker shadow-sm" />
  );
}

function MarkerLabel({
  muted = false,
  children,
}: {
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-sm bg-surface/85 px-1 whitespace-nowrap",
        muted ? "text-xs text-text-muted" : "text-sm font-semibold text-text",
      )}
    >
      {children}
    </span>
  );
}
