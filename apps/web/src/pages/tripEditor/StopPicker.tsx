import type { Trip } from "@wayline/domain";
import { HOTEL_KM } from "@wayline/providers";
import { StopChoices } from "@wayline/ui";
import { useStopOptions } from "./stopChoices";
import type { TripEditorState } from "./useTripEditor";

/** The stop choice under the pointer, here or on the map. The map previews it. */
export type StopHover = {
  name?: string;
  onHover: (name: string | undefined) => void;
};

/** The stop and its alternatives, with km, ascent and hotels for each. */
export function StopPicker({
  trip,
  index,
  editor,
  hover,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  hover: StopHover;
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
      onSelect={(name) => {
        const option = options.find((o) => o.place.name === name);
        hover.onHover(undefined);
        if (option) void editor.moveStop(index, option.place);
      }}
      onHover={hover.onHover}
      {...(hover.name && { hoveredId: hover.name })}
      hotelsRadius={HOTEL_KM * 1000}
    />
  );
}
