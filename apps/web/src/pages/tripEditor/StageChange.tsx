import type { Trip } from "@wayline/domain";
import { ChangeNotice, useFormat } from "@wayline/ui";
import { useTranslation } from "react-i18next";
import { isChanged } from "./routeEdits";
import type { TripEditorState } from "./useTripEditor";

/** Says how a stage differs from its proposal, with a way back. */
export function StageChange({
  trip,
  index,
  editor,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stage = trip.stages[index];
  const proposed = trip.proposed?.[index];
  if (!stage || !proposed || !isChanged(trip, index) || editor.readOnly) {
    return null;
  }
  const diff = stage.stats.distance - proposed.stats.distance;
  const distance = format.distance(Math.abs(diff));
  return (
    <ChangeNotice
      title={t("stage.changed")}
      detail={
        Math.abs(diff) < 500
          ? undefined
          : t(diff > 0 ? "stage.longer" : "stage.shorter", { distance })
      }
      actionLabel={t("stage.revert")}
      onAction={() => void editor.revert(index)}
      disabled={!editor.canEdit}
    />
  );
}
