import { distanceKm, type Trip } from "@wayline/domain";
import { Button, HotelRow } from "@wayline/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHotels } from "../../data/queries";
import { toHotel, type TripEditorState } from "./useTripEditor";

/** The hotel at the stop, and a list to pick another one. */
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
  const stage = trip.stages[index];
  const hotels = useHotels(
    open ? stage?.end : undefined,
    trip.settings.hotelBudget,
  );
  if (!stage) return null;
  const { hotel, end } = stage;
  const toggle = !editor.readOnly && (
    <ToggleButton open={open} onClick={() => setOpen(!open)} />
  );

  return (
    <div className="flex flex-col gap-2">
      {hotel ? (
        <HotelRow
          name={hotel.name}
          stars={hotel.stars}
          distance={distanceKm(hotel.coord, end.coord) * 1000}
          website={hotel.website}
          action={toggle || undefined}
        />
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
          {t("stage.noHotel")}
          {toggle}
        </div>
      )}
      {open && (
        <ul className="flex flex-col gap-2 rounded-md border border-border p-2.5">
          {hotels.data
            ?.filter((option) => option.osmId !== hotel?.osmId)
            .map((option) => (
              <li key={option.osmId}>
                <HotelRow
                  name={option.name}
                  stars={option.stars}
                  distance={option.distanceKm * 1000}
                  website={option.website}
                  action={
                    <Button
                      size="sm"
                      disabled={!editor.canEdit}
                      onClick={() => {
                        editor.setHotel(index, toHotel(option));
                        setOpen(false);
                      }}
                    >
                      {t("stage.choose")}
                    </Button>
                  }
                />
              </li>
            ))}
          {hotels.data?.length === 0 && (
            <li className="text-sm text-text-muted">
              {t("stage.noHotelsNear", { place: end.name })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ToggleButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("tripEditor");
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-expanded={open}
      onClick={onClick}
      className="underline"
    >
      {open ? t("stage.done") : t("stage.change")}
    </Button>
  );
}
