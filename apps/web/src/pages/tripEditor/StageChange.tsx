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
  onHighlight,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  /** Called with true while the notice is under the pointer. */
  onHighlight?: (on: boolean) => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stage = trip.stages[index];
  const proposed = trip.proposed?.[index];
  if (!stage || !proposed || !isChanged(trip, index) || editor.readOnly) {
    return null;
  }
  const diff = stage.stats.distance - proposed.stats.distance;
  const climb = stage.stats.ascent - proposed.stats.ascent;
  const details = [
    Math.abs(diff) >= 500 &&
      t(diff > 0 ? "stage.longer" : "stage.shorter", {
        distance: format.distance(Math.abs(diff)),
      }),
    Math.abs(climb) >= 20 &&
      t(climb > 0 ? "stage.moreClimbing" : "stage.lessClimbing", {
        ascent: format.elevation(Math.abs(climb)),
      }),
  ].filter(Boolean);
  return (
    <ChangeNotice
      title={t("stage.changed")}
      detail={details.length ? details.join(" · ") : undefined}
      actionLabel={t("stage.revert")}
      onAction={() => void editor.revert(index)}
      disabled={!editor.canEdit}
      onHighlight={onHighlight}
    />
  );
}
