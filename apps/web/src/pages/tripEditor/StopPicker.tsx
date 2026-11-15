import type { Trip } from "@wayline/domain";
import { HOTEL_KM } from "@wayline/providers";
import { StopChoices } from "@wayline/ui";
import { dayChoiceProps, useDayChoices, WaysFooter } from "./dayChoices";
import type { OtherWaysState } from "./otherWays";
import { useStopOptions } from "./stopChoices";
import type { TripEditorState } from "./useTripEditor";

/** The stop choice under the pointer, here or on the map. The map previews it. */
export type StopHover = {
  name?: string;
  onHover: (name: string | undefined) => void;
};

/**
 * The stop, other stops and other ways to it, with km, ascent and hotels
 * for each.
 */
export function StopPicker({
  trip,
  index,
  editor,
  hover,
  ways,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  hover: StopHover;
  ways: OtherWaysState;
}) {
  const options = useStopOptions(trip, index);
  const choices = useDayChoices(
    options.map((o) => ({
      id: o.place.name,
      name: o.place.name,
      current: o.current,
      distance: o.distance,
      ascent: o.ascent,
      ...(o.nextDistance !== undefined && { nextDistance: o.nextDistance }),
      ...(o.beds && { hotels: o.beds.total }),
      ...(o.size && { size: o.size }),
    })),
    ways,
  );
  return (
    <StopChoices
      choices={choices}
      disabled={!editor.canEdit}
      {...dayChoiceProps(hover, ways, (name) => {
        const option = options.find((o) => o.place.name === name);
        if (option) void editor.moveStop(index, option.place);
      })}
      footer={<WaysFooter ways={ways} disabled={!editor.canEdit} />}
      hotelsRadius={HOTEL_KM * 1000}
    />
  );
}
