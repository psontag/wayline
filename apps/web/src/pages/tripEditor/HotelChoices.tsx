import type { Trip } from "@wayline/domain";
import { detourKm, type HotelOption } from "@wayline/providers";
import { ChoiceList, HotelActions, HotelDetail, MoreRow } from "@wayline/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSiteInfo } from "../../data/queries";
import { hotelBookingUrl } from "./BookingLink";
import { SITE_CHECKS } from "./SiteHotelRow";
import { useStopHotels } from "./stopChoices";
import { toHotel, type TripEditorState } from "./useTripEditor";

/** Rows shown before "more hotels". */
const FIRST = 3;

/** Hotels at the stop to pick from. The chosen and saved ones come first. */
export function HotelChoices({
  trip,
  index,
  editor,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
}) {
  const { t } = useTranslation("tripEditor");
  const [all, setAll] = useState(false);
  const { hotels, route } = useStopHotels(trip, index);
  const stage = trip.stages[index];
  if (!stage) return null;
  const { hotel, end } = stage;
  const isSaved = (osmId: string) =>
    trip.savedHotels.some((h) => h.osmId === osmId);
  const chosen = hotel && hotels.find((h) => h.osmId === hotel.osmId);
  const rest = hotels.filter((h) => h.osmId !== hotel?.osmId);
  const saved = rest.filter((h) => isSaved(h.osmId));
  const others = rest.filter((h) => !isSaved(h.osmId));
  const top = [...saved, ...others].slice(0, FIRST - (hotel ? 1 : 0));
  const shown = all ? [...saved, ...others] : top;
  const hidden = saved.length + others.length - top.length;

  if (!hotel && hotels.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {t("stage.noHotelsNear", { place: end.name })}
      </p>
    );
  }

  const option = (
    h: Pick<HotelOption, "osmId" | "name" | "coord" | "stars" | "website"> &
      Partial<Pick<HotelOption, "kind" | "detourKm">>,
    i: number,
  ) => ({
    id: h.osmId,
    title: h.name,
    detail: (
      <HotelDetail
        kind={h.kind}
        stars={h.stars}
        detour={(h.detourKm ?? detourKm(h.coord, route)) * 1000}
      />
    ),
    end: (
      <SiteActions
        check={i < SITE_CHECKS}
        website={h.website}
        booking={hotelBookingUrl(trip, index, h)}
        saved={isSaved(h.osmId)}
        {...(editor.canEdit && {
          onToggleSave: () => editor.toggleSavedHotel(toHotel(h)),
        })}
      />
    ),
  });

  return (
    <ChoiceList
      aria-label={t("hotels.label", { place: end.name })}
      value={hotel?.osmId}
      onValueChange={
        editor.readOnly
          ? undefined
          : (osmId) => {
              const h = hotels.find((x) => x.osmId === osmId);
              if (h) editor.setHotel(index, toHotel(h));
            }
      }
      disabled={!editor.canEdit}
      options={[
        ...(hotel ? [option({ ...chosen, ...hotel }, 0)] : []),
        ...shown.map((h, i) => option(h, i + 1)),
      ]}
      footer={
        hidden > 0 && (
          <MoreRow
            label={
              all ? t("hotels.fewer") : t("hotels.more", { count: hidden })
            }
            expanded={all}
            onClick={() => setAll(!all)}
          />
        )
      }
    />
  );
}

/** Hotel links, without the website when it is gone. */
function SiteActions({
  check,
  website,
  ...props
}: Parameters<typeof HotelActions>[0] & { check: boolean }) {
  const site = useSiteInfo(check ? website : undefined);
  return (
    <HotelActions
      {...props}
      website={site?.ok === false ? undefined : website}
    />
  );
}
