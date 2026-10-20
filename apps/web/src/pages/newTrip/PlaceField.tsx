import type { Place } from "@wayline/domain";
import { Combobox, type ComboboxOption, useFormat } from "@wayline/ui";
import { Crosshair, MapPin, TrainFront } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { nearbyStation, placeKey, searchPlaces } from "./places";

type PlaceFieldProps = {
  id: string;
  places: Place[];
  value: Place | null;
  onChange: (place: Place) => void;
  invalid?: boolean;
  describedBy?: string;
};

/** Search and pick a town or station. Towns show their station, if close. */
export function PlaceField({
  id,
  places,
  value,
  onChange,
  invalid,
  describedBy,
}: PlaceFieldProps) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const [search, setSearch] = useState("");
  const results = useMemo(() => searchPlaces(places, search), [places, search]);
  const byKey = useMemo(
    () => new Map(places.map((p) => [placeKey(p), p])),
    [places],
  );

  const describe = (place: Place) => {
    if (place.kind === "station") return t("placeKind.station");
    if (place.kind === "custom") return t("placeKind.custom");
    const near = nearbyStation(place, places);
    return near
      ? t("placeKind.townWithStation", {
          distance: format.distance(near.km * 1000),
        })
      : t("placeKind.town");
  };

  const option = (place: Place): ComboboxOption => ({
    value: placeKey(place),
    label: place.name,
    description: describe(place),
    icon:
      place.kind === "station" ? (
        <TrainFront aria-hidden />
      ) : place.kind === "custom" ? (
        <Crosshair aria-hidden />
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
