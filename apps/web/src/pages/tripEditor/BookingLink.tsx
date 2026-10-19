import {
  addDays,
  bookingUrl,
  type MinRating,
  type Trip,
} from "@wayline/domain";
import { Button, Label, Select } from "@wayline/ui";
import { ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

const ratings = ["any", "70", "80", "90"] as const;
type Rating = (typeof ratings)[number];

/**
 * Booking.com search for the stop, with dates, budget and rating.
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
  const id = useId();
  const [rating, setRating] = useState<Rating>("80");
  const stage = trip.stages[index];
  if (!stage) return null;

  const href = bookingUrl({
    town: stage.end.name,
    date: trip.startDate && addDays(trip.startDate, index),
    budget: trip.settings.hotelBudget,
    minRating: rating === "any" ? undefined : (Number(rating) as MinRating),
  });

  const button = (
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
  );
  if (variant === "button") return <div className="flex">{button}</div>;

  const select = (
    <div className="w-20 shrink-0">
      <Select
        id={id}
        size="sm"
        value={rating}
        onValueChange={(value) => setRating(value as Rating)}
        options={ratings.map((value) => ({
          value,
          label:
            value === "any" ? t("stage.ratingAny") : `${Number(value) / 10}+`,
        }))}
      />
    </div>
  );
  const label = (
    <Label htmlFor={id} className="text-xs font-normal text-text-muted">
      {t("stage.rating")}
    </Label>
  );

  if (variant === "footer") {
    return (
      <div className="flex w-full items-end gap-2">
        {button}
        <div className="flex flex-col gap-0.5">
          {label}
          {select}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {button}
      {label}
      {select}
    </div>
  );
}
