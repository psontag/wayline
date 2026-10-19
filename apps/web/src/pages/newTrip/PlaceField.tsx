import type { Place } from "@wayline/domain";
import { Combobox, type ComboboxOption } from "@wayline/ui";
import { MapPin, TrainFront } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { placeKey, searchPlaces } from "./places";

type PlaceFieldProps = {
  id: string;
  places: Place[];
  value: Place | null;
  onChange: (place: Place) => void;
  invalid?: boolean;
  describedBy?: string;
};

/** Search and pick a station or town. */
export function PlaceField({
  id,
  places,
  value,
  onChange,
  invalid,
  describedBy,
}: PlaceFieldProps) {
  const { t } = useTranslation("newTrip");
  const [search, setSearch] = useState("");
  const results = useMemo(() => searchPlaces(places, search), [places, search]);
  const byKey = useMemo(
    () => new Map(places.map((p) => [placeKey(p), p])),
    [places],
  );

  const option = (place: Place): ComboboxOption => ({
    value: placeKey(place),
    label: place.name,
    description: t(
      place.kind === "station" ? "placeKind.station" : "placeKind.town",
    ),
    icon:
      place.kind === "station" ? (
        <TrainFront aria-hidden />
      ) : (
        <MapPin aria-hidden />
      ),
  });

  return (
    <Combobox
      id={id}
      options={results.map(option)}
      onSearchChange={setSearch}
      value={value ? placeKey(value) : undefined}
      selected={value ? option(value) : undefined}
      onValueChange={(key) => {
        const place = byKey.get(key);
        if (place) onChange(place);
      }}
      placeholder={t("placePlaceholder")}
      searchPlaceholder={t("placeSearch")}
      aria-invalid={invalid}
      aria-describedby={describedBy}
    />
  );
}
