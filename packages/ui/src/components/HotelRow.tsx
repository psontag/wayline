import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { statIcons } from "../icons";
import { focusRing } from "./Button";
import { Stat } from "./Stat";

export type HotelRowProps = {
  name: string;
  kind?: "hotel" | "guest_house" | "motel";
  stars?: number;
  /** Meters from the route, shown as "1.2 km from route". */
  distance?: number;
  /** Meters of riding off the route, shown as "+1.2 km". */
  detour?: number;
  website?: string;
  /** Booking.com search for this hotel. */
  booking?: string;
  /** E.g. a Change or Choose button. */
  action?: ReactNode;
  /** card: outlined box without the bed icon, for lists on phones. */
  variant?: "plain" | "card";
  /** Highlights the card. Only for the card variant. */
  selected?: boolean;
};

/** A hotel with kind, stars, distance to the route and links. */
export function HotelRow({
  name,
  kind,
  stars,
  distance,
  detour,
  website,
  booking,
  action,
  variant = "plain",
  selected = false,
}: HotelRowProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const meta = "font-normal text-text-muted";
  const links = [
    website && { href: website, label: t("hotel.website") },
    booking && { href: booking, label: t("hotel.booking") },
  ].filter((l) => !!l);

  return (
    <div
      className={cn(
        "flex items-center",
        variant === "plain" && "gap-2.5",
        variant === "card" && "gap-3 rounded-md border p-3",
        variant === "card" &&
          (selected
            ? "border-selected-border bg-selected"
            : "border-border bg-surface"),
      )}
    >
      {variant === "plain" && (
        <statIcons.beds className="size-4 shrink-0" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate",
            variant === "plain" ? "font-semibold" : "font-bold",
          )}
        >
          {name}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted tabular-nums">
          {kind && <span>{t(`hotel.kind.${kind}`)}</span>}
          {!!stars && (
            <Stat
              size="sm"
              icon="stars"
              value={String(stars)}
              label={t("hotel.stars", { count: stars })}
              className={meta}
            />
          )}
          {distance !== undefined && (
            <Stat
              size="sm"
              icon="distance"
              value={format.distance(distance)}
              label={t("hotel.fromRouteLabel")}
              className={meta}
            />
          )}
          {detour !== undefined && (
            <Stat
              size="sm"
              icon="distance"
              value={t("hotel.detourValue", {
                distance: format.distance(detour),
              })}
              label={t("hotel.detourLabel")}
              className={meta}
            />
          )}
          {links.map(({ href, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "inline-flex items-center gap-1 rounded-sm text-text-muted underline hover:text-text",
                focusRing,
              )}
            >
              {label}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ))}
        </span>
      </div>
      {action}
    </div>
  );
}
