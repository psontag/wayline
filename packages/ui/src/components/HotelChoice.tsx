import { ExternalLink, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { SaveHotelButton } from "./HotelRow";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";
import { Stat } from "./Stat";

export type HotelDetailProps = {
  kind?: "hotel" | "guest_house" | "motel";
  stars?: number;
  /** Meters of riding off the route. */
  detour?: number;
};

/** Kind, stars and detour of a hotel, as the second line of a choice. */
export function HotelDetail({ kind, stars, detour }: HotelDetailProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  return (
    <>
      {kind && <span>{t(`hotel.kind.${kind}`)}</span>}
      {!!stars && (
        <Stat
          size="sm"
          icon="stars"
          value={String(stars)}
          label={t("hotel.stars", { count: stars })}
          muted
        />
      )}
      {detour !== undefined && (
        <Stat
          size="sm"
          icon="distance"
          value={t("hotel.detourValue", { distance: format.distance(detour) })}
          label={t("hotel.detourLabel")}
          muted
        />
      )}
    </>
  );
}

export type HotelActionsProps = {
  website?: string;
  /** Booking.com search for this hotel. */
  booking?: string;
  saved?: boolean;
  /** Without it, there is no save button, e.g. on shared trips. */
  onToggleSave?: () => void;
};

/** Website, Booking.com and save, at the end of a hotel choice. */
export function HotelActions({
  website,
  booking,
  saved = false,
  onToggleSave,
}: HotelActionsProps) {
  const { t } = useTranslation("ui");
  return (
    <>
      {website && (
        <LinkButton href={website} label={t("hotel.website")}>
          <Globe aria-hidden />
        </LinkButton>
      )}
      {booking && (
        <LinkButton href={booking} label={t("hotel.booking")}>
          <ExternalLink aria-hidden />
        </LinkButton>
      )}
      {onToggleSave && <SaveHotelButton saved={saved} onClick={onToggleSave} />}
    </>
  );
}

function LinkButton({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <Button asChild iconOnly aria-label={label} size="sm" variant="ghost">
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      </Button>
    </Tooltip>
  );
}
