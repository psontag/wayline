import {
  addDays,
  bookingHotelUrl,
  bookingUrl,
  type LonLat,
  type Trip,
} from "@wayline/domain";
import { Button } from "@wayline/ui";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Booking.com search around one hotel at a stop, with the stage dates. */
export function hotelBookingUrl(
  trip: Trip,
  index: number,
  hotel: { name: string; coord: LonLat },
) {
  return bookingHotelUrl({
    hotel: hotel.name,
    coord: hotel.coord,
    date: trip.startDate && addDays(trip.startDate, index),
  });
}

/**
 * Booking.com search for the stop, with dates and budget.
 * row: card on desktop. button: only the button. footer: phone stop sheet.
 */
export function BookingLink({
  trip,
  index,
  variant = "row",
}: {
  trip: Trip;
  index: number;
  variant?: "row" | "button" | "footer";
}) {
  const { t } = useTranslation("tripEditor");
  const stage = trip.stages[index];
  if (!stage) return null;

  const href = bookingUrl({
    town: stage.end.name,
    date: trip.startDate && addDays(trip.startDate, index),
    budget: trip.settings.hotelBudget,
  });

  return (
    <div className="flex w-full">
      <Button
        asChild
        variant="primary"
        size={variant === "row" ? "sm" : "lg"}
        className="min-w-0 flex-1"
      >
        <a href={href} target="_blank" rel="noreferrer">
          <span className="truncate">
            {variant === "footer"
              ? t("phone.checkPrices")
              : t("stage.bookHotels", { place: stage.end.name })}
          </span>
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </div>
  );
}
