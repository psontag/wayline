import {
  ArrowUp,
  BedDouble,
  BookmarkCheck,
  ExternalLink,
  Move,
  Star,
  TrainFront,
  Trash2,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { Button, focusRing } from "./Button";
import { SaveHotelButton } from "./HotelRow";
import { type RouteColor, routeColorClasses } from "./RouteLabel";
import { windSpeedColor } from "./MapLayerMenu";

export type StopMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Day number of the stage that ends here. */
  day: number;
  /** Place name next to the marker. */
  name?: string;
  /** Same as tone "end". */
  selected?: boolean;
  /**
   * Its part in the selected day: where it ends (large, in the route
   * color), where it starts (outlined in the route color) or another day
   * (small and faded). Default: no day selected.
   */
  tone?: StopTone;
};

export type StopTone = "default" | "start" | "end" | "muted";

/** Numbered stop on the map: the end of that day. */
export function StopMarker({
  day,
  name,
  selected = false,
  tone = selected ? "end" : "default",
  className,
  ...props
}: StopMarkerProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1.5 rounded-full",
        tone === "muted" && "opacity-70 hover:opacity-100",
        focusRing,
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full font-extrabold tabular-nums shadow-md",
          {
            end: "size-10 border-2 border-route-outline bg-route-selected text-md text-on-route ring-4 ring-surface",
            start:
              "size-8 border-4 border-route-selected bg-surface text-sm text-text",
            default:
              "size-8 border-2 border-surface bg-marker text-sm text-surface",
            muted:
              "size-6 border-2 border-surface bg-marker text-xs text-surface",
          }[tone],
        )}
      >
        {day}
      </span>
      {name && (
        <MarkerLabel strong={tone === "end"} muted={tone === "muted"}>
          {shortName(name)}
        </MarkerLabel>
      )}
    </button>
  );
}

/**
 * Start or end of a trip, with a train icon at stations. Tones as for
 * StopMarker: "start" and "end" when the selected day starts or ends here.
 */
export function EndpointMarker({
  name,
  station = false,
  tone = "default",
}: {
  name?: string;
  station?: boolean;
  tone?: StopTone;
}) {
  const ofDay = tone === "start" || tone === "end";
  return (
    <span
      className={cn(
        "flex items-center gap-1.5",
        tone === "muted" && "opacity-70",
      )}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-md bg-marker text-surface shadow-sm",
          ofDay && "ring-4 ring-route-selected",
        )}
      >
        {station ? (
          <TrainFront className="size-3.5" aria-hidden />
        ) : (
          <span className="size-2 rounded-full bg-surface" />
        )}
      </span>
      {name && (
        <MarkerLabel strong={tone === "end"} muted={tone === "muted"}>
          {shortName(name)}
        </MarkerLabel>
      )}
    </span>
  );
}

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
  return (
    <span role="img" aria-label={label} className="flex items-center gap-1.5">
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full bg-surface shadow-md",
          windSpeedColor(speed),
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
  /** Being previewed: a larger circle and the full label. */
  selected?: boolean;
  /**
   * Color of the route that ends here. With it, the marker is a dashed
   * stop marker in that color, filled while selected.
   */
  color?: RouteColor;
  /** Day number the stop would have. Shown inside a colored marker. */
  day?: number;
};

const routeBorderClasses: Record<RouteColor, string> = {
  route1: "border-route-1",
  route2: "border-route-2",
  route3: "border-route-3",
  route4: "border-route-4",
  route5: "border-route-5",
  route6: "border-route-6",
  route7: "border-route-7",
  route8: "border-route-8",
};

/**
 * Another town to end the day in. With a color, it reads as another
 * version of the day's stop: the same number, dashed, in its route color.
 */
export function AlternativeMarker({
  label,
  beds,
  compact = false,
  selected = false,
  color,
  day,
  className,
  ...props
}: AlternativeMarkerProps) {
  const { t } = useTranslation("ui");
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "group flex items-center gap-1.5 rounded-full",
        focusRing,
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full border-2 font-extrabold tabular-nums transition-all",
          color
            ? cn(
                "text-sm shadow-md",
                routeBorderClasses[color],
                selected
                  ? cn(
                      "size-8 text-on-route ring-4 ring-surface",
                      routeColorClasses[color],
                    )
                  : // The color is on the ring. Light route colors are too
                    // pale for the number.
                    "size-7 border-3 border-dashed bg-surface text-text",
              )
            : selected
              ? "size-4 border-selected-border bg-accent"
              : "size-4 border-dashed border-text-muted bg-surface/60 group-hover:border-text",
        )}
      >
        {color && day}
      </span>
      <MarkerLabel
        muted={!selected}
        className={cn(
          compact &&
            !selected &&
            "hidden group-hover:inline group-focus-visible:inline",
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

export type TownMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  name: string;
  hotels: number;
  /** Only the badge; the name shows on hover or focus. For crowded maps. */
  compact?: boolean;
  /** Being previewed. */
  selected?: boolean;
};

/** A town with hotels the day could end in: a hotel badge and its name. */
export function TownMarker({
  name,
  hotels,
  compact = false,
  selected = false,
  className,
  ...props
}: TownMarkerProps) {
  const { t } = useTranslation("ui");
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "group flex items-center gap-1 rounded-full",
        focusRing,
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex h-6 items-center gap-1 rounded-full border-2 px-1.5 text-xs font-extrabold tabular-nums shadow-sm transition-colors",
          selected
            ? "border-selected-border bg-accent text-on-accent"
            : "border-marker bg-surface text-text group-hover:border-selected-border",
        )}
      >
        <BedDouble className="size-3.5" aria-hidden />
        {hotels}
        <span className="sr-only">
          {t("marker.townHotels", { count: hotels })}
        </span>
      </span>
      <MarkerLabel
        muted={!selected}
        className={cn(
          compact &&
            !selected &&
            "hidden group-hover:inline group-focus-visible:inline",
        )}
      >
        {name}
      </MarkerLabel>
    </button>
  );
}

export type ViaMarkerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & { selected?: boolean };

/**
 * Via point on the route. The dot is small, the button is a full touch
 * target. Give it an aria-label that says what a click does.
 */
export function ViaMarker({ selected, className, ...props }: ViaMarkerProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "group flex size-11 items-center justify-center rounded-full",
        focusRing,
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "block rounded-full border-2 shadow-sm transition-colors",
          selected
            ? "size-4 border-surface bg-via-point ring-4 ring-via-point/30"
            : "size-3.5 border-via-point bg-surface group-hover:bg-via-point",
        )}
      />
    </button>
  );
}

export type ViaActionsProps = {
  /** Names the point, e.g. "Via point 2". */
  label: string;
  removeLabel: string;
  onRemove: () => void;
  /** Without it, there is no Move button, e.g. where the point is dragged. */
  onMove?: () => void;
  moveLabel?: string;
};

/** Actions of the selected via point, shown above it on the map. */
export function ViaActions({
  label,
  removeLabel,
  onRemove,
  onMove,
  moveLabel,
}: ViaActionsProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 rounded-md border border-border bg-surface-raised py-1 pr-1 pl-3 text-sm font-semibold text-text shadow-md"
    >
      <span className="whitespace-nowrap">{label}</span>
      {onMove && (
        <Button size="sm" variant="secondary" onClick={onMove}>
          <Move aria-hidden />
          {moveLabel}
        </Button>
      )}
      <Button size="sm" variant="danger" onClick={onRemove}>
        <Trash2 aria-hidden />
        {removeLabel}
      </Button>
    </div>
  );
}

/**
 * The point being placed: a pin whose tip marks the spot. It stays in the
 * middle of the map while the map moves under it.
 */
export function PlacePin() {
  return (
    <span className="pointer-events-none flex flex-col items-center">
      <span className="flex size-7 items-center justify-center rounded-full bg-via-point shadow-md">
        <span className="size-2.5 rounded-full bg-surface" />
      </span>
      <span className="h-4 w-0.5 bg-via-point" />
      <span className="size-2 rounded-full bg-via-point" />
    </span>
  );
}

/** Short figures next to a dragged point, e.g. the change in distance. */
export function PreviewLabel({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none rounded-sm bg-inverse px-2 py-1 text-xs font-bold whitespace-nowrap text-on-inverse tabular-nums shadow-md">
      {children}
    </span>
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
