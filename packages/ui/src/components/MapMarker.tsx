import {
  ArrowUp,
  BedDouble,
  BookmarkCheck,
  ExternalLink,
  Star,
  TrainFront,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { SaveHotelButton } from "./HotelRow";
import { WIND_SPEED_STEPS } from "./MapLayerMenu";

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
      {name && <MarkerLabel strong={selected}>{shortName(name)}</MarkerLabel>}
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
      {name && <MarkerLabel>{shortName(name)}</MarkerLabel>}
    </span>
  );
}

const windSpeedColor = [
  "text-wind-speed-1",
  "text-wind-speed-2",
  "text-wind-speed-3",
  "text-wind-speed-4",
] as const;

/**
 * Wind at a place: an arrow pointing where the wind blows, colored by
 * speed, and the speed.
 */
export function WindMarker({
  from,
  speed,
  label,
}: {
  /** Degrees the wind comes from. */
  from: number;
  /** km/h */
  speed: number;
  /** For screen readers, e.g. "Wind from the west, 18 km/h". */
  label: string;
}) {
  const format = useFormat();
  const step = WIND_SPEED_STEPS.filter((s) => speed >= s).length;
  return (
    <span role="img" aria-label={label} className="flex items-center gap-1.5">
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full bg-surface shadow-md",
          windSpeedColor[step],
        )}
      >
        <ArrowUp
          aria-hidden
          className="size-4"
          style={{ transform: `rotate(${(from + 180) % 360}deg)` }}
        />
      </span>
      <MarkerLabel>{format.speed(speed)}</MarkerLabel>
    </span>
  );
}

/** "Regensburg Hauptbahnhof" → "Regensburg Hbf", as on German signs. */
function shortName(name: string): string {
  return name.replace(/\s+Hauptbahnhof\b/, " Hbf");
}

export type AlternativeMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Name and distance, e.g. "Küps · 56 km". */
  label: string;
  /** Places to sleep there. Hidden when unknown. */
  beds?: number;
  /** Only the circle; the label shows on hover or focus. For crowded maps. */
  compact?: boolean;
};

/** Another town that works as the stop. Dashed, so it reads as an option. */
export function AlternativeMarker({
  label,
  beds,
  compact = false,
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
      <MarkerLabel
        muted
        className={cn(
          compact && "hidden group-hover:inline group-focus-visible:inline",
        )}
      >
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
  /** Booking.com search around this hotel. */
  booking?: string;
  /** Preview image from the website. */
  image?: string;
  selected?: boolean;
  /** Bookmarked. Shows a bookmark on the marker. */
  saved?: boolean;
  /** Without it, the card has no save button. */
  onToggleSave?: () => void;
  /** A small dot, for zoomed out maps. Selected hotels stay full. */
  compact?: boolean;
  onClick?: () => void;
  /** Hover or focus, e.g. to lift the marker above others. */
  onActiveChange?: (active: boolean) => void;
};

/** Hotel on the map: a bed icon with its stars, or a dot when compact. Shows a card on hover. */
export function HotelMarker({
  name,
  kind,
  stars,
  detour,
  website,
  booking,
  image,
  selected = false,
  saved = false,
  onToggleSave,
  compact = false,
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
      {compact && !selected && !saved ? (
        <button
          type="button"
          aria-pressed={false}
          aria-label={name}
          className={cn("block rounded-full p-1", focusRing)}
          onClick={onClick}
        >
          <span className="block size-3 rounded-full border-2 border-marker bg-surface shadow-sm transition-colors group-hover:bg-marker" />
        </button>
      ) : (
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
          {saved && (
            <>
              <BookmarkCheck className="size-3" aria-hidden />
              <span className="sr-only">{t("hotel.saved")}</span>
            </>
          )}
          {!!stars && (
            <>
              {stars}
              <Star className="size-2.5 fill-current" aria-hidden />
            </>
          )}
        </button>
      )}
      {/* Padding, not margin, so the pointer can move onto the card. */}
      <div className="absolute bottom-full left-1/2 hidden -translate-x-1/2 pb-2 group-focus-within:block group-hover:block">
        <div className="flex w-popover flex-col overflow-hidden rounded-md border border-border bg-surface shadow-md">
          {image && (
            <img
              src={image}
              alt=""
              className="h-24 w-full bg-hover object-cover"
            />
          )}
          <div className="flex items-start gap-2 px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-bold text-text">{name}</span>
              <span className="text-xs text-text-muted tabular-nums">
                {meta}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-3">
                {[
                  booking && { href: booking, label: t("hotel.booking") },
                  website && { href: website, label: t("hotel.website") },
                ]
                  .filter((l) => !!l)
                  .map(({ href, label }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm text-xs text-text-muted underline hover:text-text",
                        focusRing,
                      )}
                    >
                      {label}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ))}
              </span>
            </div>
            {onToggleSave && (
              <SaveHotelButton saved={saved} onClick={onToggleSave} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type StationMarkerProps = {
  name: string;
  /** bahn.de search for trains home from here. */
  href: string;
};

/** Train station near the route, to end a trip early. Shows a card on hover. */
export function StationMarker({ name, href }: StationMarkerProps) {
  const { t } = useTranslation("ui");
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={name}
        className={cn(
          "flex size-4 items-center justify-center rounded-sm bg-text-muted text-surface shadow-sm transition-colors hover:bg-text",
          focusRing,
        )}
      >
        <TrainFront className="size-2.5" aria-hidden />
      </button>
      {/* Padding, not margin, so the pointer can move onto the card. */}
      <div className="absolute bottom-full left-1/2 hidden -translate-x-1/2 pb-2 group-focus-within:block group-hover:block">
        <div className="flex w-max flex-col rounded-md border border-border bg-surface px-3 py-2 shadow-md">
          <span className="text-sm font-bold text-text">{name}</span>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "mt-1 inline-flex items-center gap-1 self-start rounded-sm text-xs text-text-muted underline hover:text-text",
              focusRing,
            )}
          >
            {t("station.trainHome")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

export type ClusterMarkerProps = {
  kind: "hotels" | "stations";
  count: number;
  /** Usually zooms in to the places of the cluster. */
  onClick?: () => void;
};

/** Hotels or stations close together on a zoomed out map, with their count. */
export function ClusterMarker({ kind, count, onClick }: ClusterMarkerProps) {
  const { t } = useTranslation("ui");
  const Icon = kind === "hotels" ? BedDouble : TrainFront;
  return (
    <button
      type="button"
      aria-label={t(`marker.${kind}`, { count })}
      className={cn(
        "flex items-center gap-0.5 border px-1.5 py-0.5 text-2xs font-bold tabular-nums shadow-sm transition-colors",
        kind === "hotels"
          ? "rounded-full border-border bg-surface text-text hover:border-marker"
          : "rounded-sm border-transparent bg-text-muted text-surface hover:bg-text",
        focusRing,
      )}
      onClick={onClick}
    >
      <Icon className={kind === "hotels" ? "size-3.5" : "size-3"} aria-hidden />
      {count}
    </button>
  );
}

function MarkerLabel({
  muted = false,
  strong = false,
  className,
  children,
}: {
  muted?: boolean;
  strong?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-sm bg-surface/85 px-1 whitespace-nowrap",
        className,
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
