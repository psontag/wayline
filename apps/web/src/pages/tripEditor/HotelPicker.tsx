import type { Trip } from "@wayline/domain";
import { detourKm } from "@wayline/providers";
import { Button, HotelRow } from "@wayline/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { hotelBookingUrl } from "./BookingLink";
import { useStopHotels } from "./stopChoices";
import { toHotel, type TripEditorState } from "./useTripEditor";

/** The hotel at the stop on top, and the other hotels nearby below. */
export function HotelPicker({
  trip,
  index,
  editor,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
}) {
  const { t } = useTranslation("tripEditor");
  const [open, setOpen] = useState(false);
  const { hotels, route } = useStopHotels(trip, index);
  const stage = trip.stages[index];
  if (!stage) return null;
  const { hotel, end } = stage;
  const chosen = hotel && hotels.find((h) => h.osmId === hotel.osmId);
  const others = hotels.filter((h) => h.osmId !== hotel?.osmId);
  const booking = (name: string) => hotelBookingUrl(trip, index, name);

  return (
    <div className="flex flex-col gap-2">
      {hotel ? (
        <HotelRow
          name={hotel.name}
          kind={chosen?.kind}
          stars={hotel.stars}
          distance={(chosen?.detourKm ?? detourKm(hotel.coord, route)) * 1000}
          website={hotel.website}
          booking={booking(hotel.name)}
        />
      ) : (
        <p className="text-sm text-text-muted">{t("stage.noHotel")}</p>
      )}
      {others.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="self-start"
          >
            {t("stage.moreHotels", { count: others.length, place: end.name })}
            {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>
          {open && (
            <ul className="flex flex-col gap-2 rounded-md border border-border p-2.5">
              {others.map((option) => (
                <li key={option.osmId}>
                  <HotelRow
                    name={option.name}
                    kind={option.kind}
                    stars={option.stars}
                    detour={option.detourKm * 1000}
                    website={option.website}
                    booking={booking(option.name)}
                    action={
                      !editor.readOnly && (
                        <Button
                          size="sm"
                          disabled={!editor.canEdit}
                          onClick={() =>
                            editor.setHotel(index, toHotel(option))
                          }
                        >
                          {t("stage.choose")}
                        </Button>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        !hotel && (
          <p className="text-sm text-text-muted">
            {t("stage.noHotelsNear", { place: end.name })}
          </p>
        )
      )}
    </div>
  );
}
