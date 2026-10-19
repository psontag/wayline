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

/** Booking.com search for the stop, with dates, budget and rating. */
export function BookingLink({ trip, index }: { trip: Trip; index: number }) {
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

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="primary" size="sm" className="min-w-0 flex-1">
        <a href={href} target="_blank" rel="noreferrer">
          <span className="truncate">
            {t("stage.bookHotels", { place: stage.end.name })}
          </span>
          <ExternalLink aria-hidden />
        </a>
      </Button>
      <Label htmlFor={id} className="text-xs font-normal text-text-muted">
        {t("stage.rating")}
      </Label>
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
    </div>
  );
}
