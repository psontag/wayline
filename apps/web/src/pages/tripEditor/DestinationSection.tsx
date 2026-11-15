import type { Trip } from "@wayline/domain";
import {
  Button,
  PanelSection,
  type StopChoice,
  StopChoices,
} from "@wayline/ui";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dayChoiceProps, useDayChoices, WaysFooter } from "./dayChoices";
import type { OtherWaysState } from "./otherWays";
import { useStopOptions } from "./stopChoices";
import type { StopHover } from "./StopPicker";
import type { TripEditorState } from "./useTripEditor";

/**
 * Last day: other ways to the end, and other train stops to end at if the
 * trip may end elsewhere. Both are looked up on request.
 */
export function DestinationSection({
  trip,
  index,
  editor,
  movable,
  finding,
  onFindingChange,
  hover,
  ways,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  /** The trip may end at another train stop. */
  movable: boolean;
  /** The train stops show here and on the map. */
  finding: boolean;
  onFindingChange: (finding: boolean) => void;
  hover: StopHover;
  ways: OtherWaysState;
}) {
  const { t } = useTranslation("tripEditor");
  const stage = trip.stages[index];
  if (!stage) return null;
  const now: StopChoice = {
    id: stage.end.name,
    name: stage.end.name,
    current: true,
    distance: stage.stats.distance,
    ascent: stage.stats.ascent,
  };
  return (
    <PanelSection
      icon="stop"
      title={t("section.choices")}
      summary={stage.end.name}
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
      {finding ? (
        <WithTrainStops
          trip={trip}
          index={index}
          editor={editor}
          onPicked={() => onFindingChange(false)}
          hover={hover}
          ways={ways}
        />
      ) : (
        <EndChoices
          towns={[now]}
          editor={editor}
          hover={hover}
          ways={ways}
          pickTown={() => {}}
        />
      )}
    </PanelSection>
  );
}

function WithTrainStops({
  trip,
  index,
  editor,
  onPicked,
  hover,
  ways,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  onPicked: () => void;
  hover: StopHover;
  ways: OtherWaysState;
}) {
  const { t } = useTranslation("tripEditor");
  const options = useStopOptions(trip, index, true);
  return (
    <>
      {options.length < 2 && (
        <p className="text-xs text-text-muted">{t("destination.none")}</p>
      )}
      <EndChoices
        towns={options.map(({ place, distance, ascent, current }) => ({
          id: place.name,
          name: place.name,
          distance,
          ascent,
          current,
        }))}
        editor={editor}
        hover={hover}
        ways={ways}
        pickTown={(name) => {
          const option = options.find((o) => o.place.name === name);
          if (!option) return;
          onPicked();
          void editor.moveStop(index, option.place);
        }}
      />
    </>
  );
}

function EndChoices({
  towns,
  editor,
  hover,
  ways,
  pickTown,
}: {
  towns: StopChoice[];
  editor: TripEditorState;
  hover: StopHover;
  ways: OtherWaysState;
  pickTown: (name: string) => void;
}) {
  const choices = useDayChoices(towns, ways);
  return (
    <StopChoices
      choices={choices}
      disabled={!editor.canEdit}
      {...dayChoiceProps(hover, ways, pickTown)}
      footer={<WaysFooter ways={ways} disabled={!editor.canEdit} />}
    />
  );
}
