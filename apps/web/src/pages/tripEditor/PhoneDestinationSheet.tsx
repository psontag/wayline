import type { Trip } from "@wayline/domain";
import { ChoiceCard, ChoiceGroup, SheetDialog, useFormat } from "@wayline/ui";
import { useTranslation } from "react-i18next";
import { useStopOptions } from "./stopChoices";
import type { TripEditorState } from "./useTripEditor";

/** Phone sheet to end the last day at another train stop. */
export function PhoneDestinationSheet({
  trip,
  index,
  editor,
  onClose,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  onClose: () => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const options = useStopOptions(trip, index, true);
  const stage = trip.stages[index];
  if (!stage) return null;

  return (
    <SheetDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("destination.title")}
      subtitle={t("destination.hint")}
    >
      {options.length < 2 ? (
        <p className="text-sm text-text-muted">{t("destination.none")}</p>
      ) : (
        <ChoiceGroup legend={t("destination.title")}>
          {options.map(({ place, distance, ascent, current }) => (
            <ChoiceCard
              key={place.name}
              name="destination"
              value={place.name}
              checked={current}
              disabled={!current && !editor.canEdit}
              onChange={() => {
                onClose();
                void editor.moveStop(index, place);
              }}
              title={place.name}
              meta={t("phone.townMeta", {
                distance: format.distance(distance),
                ascent: format.elevation(ascent),
              })}
              note={
                current
                  ? t("phone.current")
                  : distance < stage.stats.distance
                    ? t("phone.shorter")
                    : t("phone.longer")
              }
            />
          ))}
        </ChoiceGroup>
      )}
    </SheetDialog>
  );
}
