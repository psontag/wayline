import { bahnUrl, tripStats, type Trip } from "@wayline/domain";
import { StatBlock, TextLink, useFormat } from "@wayline/ui";
import { TrainFront } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Totals of the trip and train links at both ends. */
export function TripSummary({ trip }: { trip: Trip }) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stats = tripStats(trip.stages);
  const start = trip.stages[0]?.start;
  const end = trip.stages.at(-1)?.end;

  return (
    <div className="flex flex-col gap-2.5 border-b border-border p-4">
      <div className="grid grid-cols-4 gap-2">
        <StatBlock
          value={t("summary.stageCount", { count: trip.stages.length })}
          label={t("summary.stages")}
        />
        <StatBlock
          value={format.distance(stats.distance)}
          label={t("summary.distance")}
        />
        <StatBlock
          value={format.elevation(stats.ascent)}
          label={t("summary.ascent")}
        />
        <StatBlock
          value={format.percent(stats.surface.paved)}
          label={t("summary.paved")}
        />
      </div>
      {(start?.kind === "station" || end?.kind === "station") && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {start?.kind === "station" && (
            <TextLink
              href={bahnUrl({ from: "", to: start.name })}
              target="_blank"
              rel="noreferrer"
            >
              <TrainFront aria-hidden />
              {t("summary.trainTo", { station: start.name })}
            </TextLink>
          )}
          {end?.kind === "station" && (
            <TextLink
              href={bahnUrl({ from: end.name, to: "" })}
              target="_blank"
              rel="noreferrer"
            >
              <TrainFront aria-hidden />
              {t("summary.trainFrom", { station: end.name })}
            </TextLink>
          )}
        </div>
      )}
    </div>
  );
}
