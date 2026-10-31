import type { Trip } from "@wayline/domain";
import { HOTEL_KM } from "@wayline/providers";
import { StopChoices } from "@wayline/ui";
import { useStopOptions } from "./stopChoices";
import type { TripEditorState } from "./useTripEditor";

/** The stop and its alternatives, with km, ascent and hotels for each. */
export function StopPicker({
  trip,
  index,
  editor,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
}) {
  const options = useStopOptions(trip, index);
  return (
    <StopChoices
      choices={options.map(({ place, beds, ...rest }) => ({
        ...rest,
        id: place.name,
        name: place.name,
        ...(beds && { hotels: beds.total }),
      }))}
      disabled={!editor.canEdit}
      onSelect={(name) => {
        const option = options.find((o) => o.place.name === name);
        if (option) void editor.moveStop(index, option.place);
      }}
      hotelsRadius={HOTEL_KM * 1000}
    />
  );
}
