import { addDays, localTimeToDate, type Trip } from "@wayline/domain";
import { detourKm } from "@wayline/providers";
import {
  Button,
  ChoiceCard,
  ChoiceGroup,
  HotelRow,
  SheetDialog,
  useFormat,
} from "@wayline/ui";
import { Lock, LockOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BookingLink, hotelBookingUrl } from "./BookingLink";
import { useStopHotels, useStopOptions } from "./stopChoices";
import { toHotel, type TripEditorState } from "./useTripEditor";

export type PhoneStopSheetProps = {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Phone sheet to pick the stop town, lock it and pick a hotel. */
export function PhoneStopSheet({
  trip,
  index,
  editor,
  open,
  onOpenChange,
}: PhoneStopSheetProps) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const { readOnly } = editor;
  const options = useStopOptions(trip, index).filter(
    (o) => o.current || !readOnly,
  );
  const stage = trip.stages[index];
  const { hotels, route } = useStopHotels(trip, index);
  if (!stage || index === trip.stages.length - 1) return null;

  const { end, hotel } = stage;
  const chosen = hotel && hotels.find((h) => h.osmId === hotel.osmId);
  const others = readOnly
    ? []
    : hotels.filter((option) => option.osmId !== hotel?.osmId);
  const booking = (name: string) => hotelBookingUrl(trip, index, name);
  const day = trip.startDate
    ? t("phone.dayDate", {
        day: index + 1,
        date: format.date(localTimeToDate(addDays(trip.startDate, index))),
      })
    : t("phone.day", { day: index + 1 });

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("phone.stopTitle")}
      subtitle={t("phone.stopSubtitle", { day, place: stage.start.name })}
      footer={<BookingLink trip={trip} index={index} variant="footer" />}
    >
      <div className="flex flex-col gap-2">
        <ChoiceGroup legend={t("phone.stopTowns")}>
          {options.map(({ place, distance, current }) => (
            <ChoiceCard
              key={place.name}
              name="stop"
              value={place.name}
              checked={current}
              disabled={!current && !editor.canEdit}
              onChange={() => void editor.moveStop(index, place)}
              title={place.name}
              meta={
                current
                  ? t("phone.townMeta", {
                      distance: format.distance(distance),
                      ascent: format.elevation(stage.stats.ascent),
                    })
                  : format.distance(distance)
              }
              note={
                current
                  ? t("phone.current")
                  : distance < stage.stats.distance
                    ? t("phone.shorter")
                    : t("phone.longer")
              }
            />
          ))}
        </ChoiceGroup>
        {!readOnly && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {end.locked ? (
              <Lock className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <LockOpen className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="flex-1">
              {t(end.locked ? "phone.locked" : "phone.unlocked", {
                place: end.name,
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!editor.canEdit}
              onClick={() => editor.setLocked(index, !end.locked)}
            >
              {end.locked ? t("phone.unlock") : t("phone.lock")}
            </Button>
          </div>
        )}
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-md font-extrabold">
          {t("phone.hotelsIn", { place: end.name })}
        </h2>
        {hotel && (
          <HotelRow
            variant="card"
            selected
            name={hotel.name}
            kind={chosen?.kind}
            stars={hotel.stars}
            distance={(chosen?.detourKm ?? detourKm(hotel.coord, route)) * 1000}
            website={hotel.website}
            booking={booking(hotel.name)}
            action={
              !readOnly && (
                <Button size="sm" aria-disabled>
                  {t("phone.picked")}
                </Button>
              )
            }
          />
        )}
        {others.map((option) => (
          <HotelRow
            key={option.osmId}
            variant="card"
            name={option.name}
            kind={option.kind}
            stars={option.stars}
            detour={option.detourKm * 1000}
            website={option.website}
            booking={booking(option.name)}
            action={
              <Button
                size="sm"
                disabled={!editor.canEdit}
                onClick={() => editor.setHotel(index, toHotel(option))}
              >
                {t("phone.pick")}
              </Button>
            }
          />
        ))}
        {hotels.length === 0 && !hotel && (
          <p className="text-sm text-text-muted">
            {t("stage.noHotelsNear", { place: end.name })}
          </p>
        )}
      </section>
    </SheetDialog>
  );
}
