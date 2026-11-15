import type { Place, Trip } from "@wayline/domain";
import { HOTEL_KM } from "@wayline/providers";
import { StopChoices } from "@wayline/ui";
import { useStopOptions } from "./stopChoices";
import type { TripEditorState } from "./useTripEditor";

/** A stop choice previewed before it is picked. Shared with the map. */
export type StopPick = {
  /** Name of the previewed choice. */
  selected?: string;
  onSelect: (name: string | undefined) => void;
  onApply: (place: Place) => void;
};

/** The stop and its alternatives, with km, ascent and hotels for each. */
export function StopPicker({
  trip,
  index,
  editor,
  pick,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  pick: StopPick;
}) {
  const options = useStopOptions(trip, index);
  return (
    <StopChoices
      choices={options.map((o) => ({
        id: o.place.name,
        name: o.place.name,
        current: o.current,
        distance: o.distance,
        ascent: o.ascent,
        ...(o.nextDistance !== undefined && { nextDistance: o.nextDistance }),
        ...(o.beds && { hotels: o.beds.total }),
        ...(o.size && { size: o.size }),
      }))}
      disabled={!editor.canEdit}
      onSelect={pick.onSelect}
      {...(pick.selected && { selectedId: pick.selected })}
      onConfirm={(name) => {
        const option = options.find((o) => o.place.name === name);
        if (option) pick.onApply(option.place);
      }}
      hotelsRadius={HOTEL_KM * 1000}
    />
  );
}
