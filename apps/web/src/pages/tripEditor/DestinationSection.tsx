import type { Trip } from "@wayline/domain";
import { Button, PanelSection } from "@wayline/ui";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DayChoiceTable, type DayChoicesState } from "./dayChoices";
import type { TripEditorState } from "./useTripEditor";

/**
 * Last day: other ways to the end, and other train stops to end at if the
 * trip may end elsewhere, looked up on request.
 */
export function DestinationSection({
  trip,
  index,
  editor,
  movable,
  finding,
  onFindingChange,
  choices,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  /** The trip may end at another train stop. */
  movable: boolean;
  /** The train stops show here and on the map. */
  finding: boolean;
  onFindingChange: (finding: boolean) => void;
  choices: DayChoicesState;
}) {
  const { t } = useTranslation("tripEditor");
  const end = trip.stages[index]?.end;
  if (!end) return null;
  const noStops =
    finding && !choices.choices.some((c) => c.kind === "stop" && !c.current);
  return (
    <PanelSection
      icon="stop"
      title={t("section.route")}
      summary={end.name}
      collapsible
    >
      {movable && (
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
      )}
      <DayChoiceTable state={choices} disabled={!editor.canEdit} hotels={false}>
        {noStops && (
          <p className="px-1.5 text-xs text-text-muted">
            {t("destination.none")}
          </p>
        )}
      </DayChoiceTable>
    </PanelSection>
  );
}
