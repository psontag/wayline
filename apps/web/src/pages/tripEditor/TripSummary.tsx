import { tripStats, type Trip } from "@wayline/domain";
import { Stat, SurfaceBar, useFormat } from "@wayline/ui";
import { useTranslation } from "react-i18next";
import { TrainOptions } from "./TrainOptions";
import type { TripEditorState } from "./useTripEditor";

/** Totals of the trip and trains at both ends. */
export function TripSummary({
  trip,
  editor,
}: {
  trip: Trip;
  editor: TripEditorState;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stats = tripStats(trip.stages);

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
      <TrainOptions trip={trip} direction="there" editor={editor} />
      <TrainOptions trip={trip} direction="back" editor={editor} />
    </div>
  );
}
