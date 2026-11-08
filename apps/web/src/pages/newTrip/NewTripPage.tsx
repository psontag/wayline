import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ErrorScreen } from "../../components/ErrorPanel";
import { useServices } from "../../data/ServicesProvider";
import { NewTripForm } from "./NewTripForm";
import { placeOptions } from "./places";

export function NewTripPage() {
  const { t } = useTranslation("newTrip");
  const { network } = useServices();
  const { kind, request } = useSearch({ from: "/new" });
  const places = useQuery({
    queryKey: ["search"],
    queryFn: () => network.search(),
    staleTime: Infinity,
  });
  const options = useMemo(
    () => (places.data ? placeOptions(places.data) : undefined),
    [places.data],
  );

  if (places.isError) {
    return (
      <ErrorScreen
        error={places.error}
        title={t("loadFailed")}
        onRetry={() => void places.refetch()}
      />
    );
  }
  if (!options) {
    return (
      <p className="p-6 text-text-muted" role="status">
        {t("loading")}
      </p>
    );
  }
  return <NewTripForm places={options} kind={kind} request={request} />;
}
