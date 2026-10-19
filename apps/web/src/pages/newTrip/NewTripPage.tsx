import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useServices } from "../../data/ServicesProvider";
import { NewTripForm } from "./NewTripForm";
import { placeOptions } from "./places";

export function NewTripPage() {
  const { t } = useTranslation("newTrip");
  const { network } = useServices();
  const { kind } = useSearch({ from: "/new" });
  const places = useQuery({
    queryKey: ["places"],
    queryFn: () => network.places(),
    staleTime: Infinity,
  });
  const options = useMemo(
    () => (places.data ? placeOptions(places.data) : undefined),
    [places.data],
  );

  if (!options) {
    return (
      <p className="p-6 text-text-muted" role="status">
        {places.isError ? t("loadFailed") : t("loading")}
      </p>
    );
  }
  return <NewTripForm places={options} kind={kind} />;
}
