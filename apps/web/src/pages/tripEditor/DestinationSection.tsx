import type { Trip } from "@wayline/domain";
import { Button, PanelSection, StopChoices } from "@wayline/ui";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStopOptions } from "./stopChoices";
import type { TripEditorState } from "./useTripEditor";

/** Last day: other train stops to end at, looked up on request. */
export function DestinationSection({
  trip,
  index,
  editor,
  finding,
  onFindingChange,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  /** The train stops show here and on the map. */
  finding: boolean;
  onFindingChange: (finding: boolean) => void;
}) {
  const { t } = useTranslation("tripEditor");
  const end = trip.stages[index]?.end;
  if (!end) return null;
  return (
    <PanelSection
      icon="stop"
      title={t("section.destination")}
      summary={end.name}
      collapsible
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-text-muted">
          {t(finding ? "destination.pick" : "destination.hint")}
        </span>
        <Button
          size="sm"
          aria-expanded={finding}
          onClick={() => onFindingChange(!finding)}
        >
          {!finding && <Search aria-hidden />}
          {t(finding ? "destination.hide" : "destination.find")}
        </Button>
      </div>
      {finding && (
        <DestinationChoices
          trip={trip}
          index={index}
          editor={editor}
          onPicked={() => onFindingChange(false)}
        />
      )}
    </PanelSection>
  );
}

function DestinationChoices({
  trip,
  index,
  editor,
  onPicked,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  onPicked: () => void;
}) {
  const { t } = useTranslation("tripEditor");
  const options = useStopOptions(trip, index, true);
  if (options.length < 2) {
    return <p className="text-xs text-text-muted">{t("destination.none")}</p>;
  }
  return (
    <StopChoices
      choices={options.map(({ place, distance, ascent, current }) => ({
        id: place.name,
        name: place.name,
        distance,
        ascent,
        current,
      }))}
      disabled={!editor.canEdit}
      onSelect={(name) => {
        const option = options.find((o) => o.place.name === name);
        if (!option) return;
        onPicked();
        void editor.moveStop(index, option.place);
      }}
    />
  );
}
