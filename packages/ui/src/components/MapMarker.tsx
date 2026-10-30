import { BedDouble, ExternalLink, Star, TrainFront } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
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

/** Numbered stop on the map. The selected one is larger, in the route color. */
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
          "flex items-center justify-center rounded-full border-2 font-extrabold tabular-nums shadow-md",
          selected
            ? "size-10 border-route-outline bg-route-selected text-md text-on-route ring-4 ring-surface"
            : "size-8 border-surface bg-marker text-sm text-surface",
        )}
      >
        {day}
      </span>
      {name && <MarkerLabel strong={selected}>{name}</MarkerLabel>}
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
> & {
  /** Name and distance, e.g. "Küps · 56 km". */
  label: string;
  /** Places to sleep there. Hidden when unknown. */
  beds?: number;
};

/** Another town that works as the stop. Dashed, so it reads as an option. */
export function AlternativeMarker({
  label,
  beds,
  className,
  ...props
}: AlternativeMarkerProps) {
  const { t } = useTranslation("ui");
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
      <MarkerLabel muted>
        {label}
        {beds !== undefined && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 tabular-nums">
            <BedDouble className="size-3" aria-hidden />
            {beds}
            <span className="sr-only">{t("marker.beds", { count: beds })}</span>
          </span>
        )}
      </MarkerLabel>
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

export type HotelKind = "hotel" | "guest_house" | "motel";

export type HotelMarkerProps = {
  name: string;
  kind: HotelKind;
  stars?: number;
  /** Extra meters to ride compared to the stop. */
  detour: number;
  website?: string;
  selected?: boolean;
  onClick?: () => void;
  /** Hover or focus, e.g. to lift the marker above others. */
  onActiveChange?: (active: boolean) => void;
};

/** Hotel on the map: a bed icon with its stars. Shows a card on hover. */
export function HotelMarker({
  name,
  kind,
  stars,
  detour,
  website,
  selected = false,
  onClick,
  onActiveChange,
}: HotelMarkerProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const meta = [
    t(`hotel.kind.${kind}`),
    stars ? t("hotel.stars", { count: stars }) : undefined,
    t("hotel.detour", { distance: format.distance(detour) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="group relative"
      onPointerEnter={() => onActiveChange?.(true)}
      onPointerLeave={() => onActiveChange?.(false)}
      onFocus={() => onActiveChange?.(true)}
      onBlur={() => onActiveChange?.(false)}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={name}
        className={cn(
          "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-2xs font-bold tabular-nums shadow-sm transition-colors",
          selected
            ? "border-route-outline bg-route-selected text-on-route"
            : "border-border bg-surface text-text hover:border-marker",
          focusRing,
        )}
        onClick={onClick}
      >
        <BedDouble className="size-3.5" aria-hidden />
        {!!stars && (
          <>
            {stars}
            <Star className="size-2.5 fill-current" aria-hidden />
          </>
        )}
      </button>
      {/* Padding, not margin, so the pointer can move onto the card. */}
      <div className="absolute bottom-full left-1/2 hidden -translate-x-1/2 pb-2 group-focus-within:block group-hover:block">
        <div className="flex w-max flex-col rounded-md border border-border bg-surface px-3 py-2 shadow-md">
          <span className="text-sm font-bold text-text">{name}</span>
          <span className="text-xs text-text-muted tabular-nums">{meta}</span>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "mt-1 inline-flex items-center gap-1 self-start rounded-sm text-xs text-text-muted underline hover:text-text",
                focusRing,
              )}
            >
              {t("hotel.website")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MarkerLabel({
  muted = false,
  strong = false,
  children,
}: {
  muted?: boolean;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-sm bg-surface/85 px-1 whitespace-nowrap",
        muted
          ? "text-xs text-text-muted"
          : strong
            ? "text-md font-bold text-text"
            : "text-sm font-semibold text-text",
      )}
    >
      {children}
    </span>
  );
}
