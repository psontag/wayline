import { trainLinks, tripStats, type Trip } from "@wayline/domain";
import { Stat, statIcons, SurfaceBar, TextLink, useFormat } from "@wayline/ui";
import { useTranslation } from "react-i18next";

/** Totals of the trip and train links at both ends. */
import { useHomeStation } from "../../data/homeStation";

export function TripSummary({ trip }: { trip: Trip }) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stats = tripStats(trip.stages);
  const [home] = useHomeStation();
  const trains = trainLinks(trip, home);
  const start = trip.stages[0]?.start;
  const end = trip.stages.at(-1)?.end;

  return (
    <div className="flex flex-col gap-3 border-b border-border p-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <Stat
          icon="dates"
          value={t("summary.stageCount", { count: trip.stages.length })}
          label={t("summary.days")}
        />
        <Stat
          icon="distance"
          value={format.distance(stats.distance)}
          label={t("summary.distance")}
        />
        <Stat
          icon="ascent"
          value={format.elevation(stats.ascent)}
          label={t("summary.ascent")}
        />
      </div>
      <SurfaceBar shares={stats.surface} caption />
      {(start?.kind === "station" || end?.kind === "station") && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {start?.kind === "station" && (
            <TextLink href={trains.there} target="_blank" rel="noreferrer">
              <statIcons.train aria-hidden />
              {t("summary.trainTo", { station: start.name })}
            </TextLink>
          )}
          {end?.kind === "station" && (
            <TextLink href={trains.back} target="_blank" rel="noreferrer">
              <statIcons.train aria-hidden />
              {t("summary.trainFrom", { station: end.name })}
            </TextLink>
          )}
        </div>
      )}
    </div>
  );
}
