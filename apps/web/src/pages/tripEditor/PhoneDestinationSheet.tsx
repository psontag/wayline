import type { Trip } from "@wayline/domain";
import { ChoiceList, SheetDialog, useFormat } from "@wayline/ui";
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
        <ChoiceList
          aria-label={t("destination.title")}
          value={options.find((o) => o.current)?.place.name}
          disabled={!editor.canEdit}
          onValueChange={(name) => {
            const option = options.find((o) => o.place.name === name);
            if (!option) return;
            onClose();
            void editor.moveStop(index, option.place);
          }}
          options={options.map(({ place, distance, ascent, current }) => ({
            id: place.name,
            title: place.name,
            detail: t("phone.townMeta", {
              distance: format.distance(distance),
              ascent: format.elevation(ascent),
            }),
            tag: current
              ? t("phone.current")
              : distance < stage.stats.distance
                ? t("phone.shorter")
                : t("phone.longer"),
          }))}
        />
      )}
    </SheetDialog>
  );
}
