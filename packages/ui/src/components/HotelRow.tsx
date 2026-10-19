import { BedDouble, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type HotelRowProps = {
  name: string;
  stars?: number;
  /** Meters from the route. */
  distance: number;
  website?: string;
  /** E.g. a Change or Choose button. */
  action?: ReactNode;
};

/** A hotel with stars, distance to the route and its website. */
export function HotelRow({
  name,
  stars,
  distance,
  website,
  action,
}: HotelRowProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const meta = [
    stars ? t("hotel.stars", { count: stars }) : undefined,
    t("hotel.fromRoute", { distance: format.distance(distance) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-2.5">
      <BedDouble className="size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{name}</span>
        <span className="flex items-center gap-2 text-xs text-text-muted tabular-nums">
          {meta}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "inline-flex items-center gap-1 rounded-sm text-text-muted underline hover:text-text",
                focusRing,
              )}
            >
              {t("hotel.website")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </span>
      </div>
      {action}
    </div>
  );
}
