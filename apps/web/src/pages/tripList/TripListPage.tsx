import { Link } from "@tanstack/react-router";
import { Button, EmptyState } from "@wayline/ui";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTrips } from "../../data/queries";
import { TripListItem } from "./TripListItem";

export function TripListPage() {
  const { t } = useTranslation("tripList");
  const trips = useTrips();

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 pt-5 pb-8 md:gap-8 md:px-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">
          {t("title")}
        </h1>
        <Button asChild variant="primary" className="max-md:hidden">
          <Link to="/new">
            <Plus aria-hidden />
            {t("newTrip")}
          </Link>
        </Button>
      </div>

      {trips.isPending ? (
        <p className="text-text-muted" role="status">
          {t("loading")}
        </p>
      ) : trips.isError ? (
        <p className="text-danger" role="alert">
          {t("loadFailed")}
        </p>
      ) : trips.data.length === 0 ? (
        <EmptyState
          title={t("empty.title")}
          text={t("empty.text")}
          action={
            <Button asChild variant="primary" className="max-md:hidden">
              <Link to="/new">{t("empty.action")}</Link>
            </Button>
          }
        />
      ) : (
        <section className="flex flex-col gap-3.5">
          <h2 className="text-md font-bold text-text-muted max-md:sr-only">
            {t("yourTrips")}
          </h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {trips.data.map((trip) => (
              <TripListItem key={trip.id} trip={trip} />
            ))}
          </div>
        </section>
      )}

      <p className="pt-2 text-center text-xs text-text-muted md:hidden">
        {t("phoneHint")}
      </p>
    </div>
  );
}
