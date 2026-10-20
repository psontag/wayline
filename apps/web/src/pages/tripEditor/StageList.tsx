import {
  localTimeToDate,
  expectedTimeAtKm,
  addDays,
  type Trip,
} from "@wayline/domain";
import { StageCard } from "@wayline/ui";
import { useWeather } from "../../data/queries";
import { BookingLink } from "./BookingLink";
import { HotelPicker } from "./HotelPicker";
import { stageWind } from "./stageWeather";
import { StopPicker } from "./StopPicker";
import type { TripEditorState } from "./useTripEditor";

export type StageListProps = {
  trip: Trip;
  selected: number;
  onSelect: (index: number) => void;
  editor: TripEditorState;
};

/** All stages. The selected one shows stop, hotel and booking. */
export function StageList({
  trip,
  selected,
  onSelect,
  editor,
}: StageListProps) {
  return (
    <ol className="flex flex-col gap-2 p-3">
      {trip.stages.map((stage, index) => (
        <li key={stage.id}>
          <StageItem
            trip={trip}
            index={index}
            selected={index === selected}
            onSelect={() => onSelect(index)}
            editor={editor}
          />
        </li>
      ))}
    </ol>
  );
}

/** Expected start and arrival of a stage, if the trip has a start date. */
export function stageTimes(trip: Trip, index: number) {
  const stage = trip.stages[index];
  if (!trip.startDate || !stage) return undefined;
  const date = addDays(trip.startDate, index);
  const { startTime, avgSpeed } = trip.settings;
  return {
    start: localTimeToDate(`${date}T${startTime}`),
    end: localTimeToDate(
      expectedTimeAtKm(date, startTime, avgSpeed, stage.stats.distance / 1000),
    ),
  };
}

export function StageItem({
  trip,
  index,
  selected,
  onSelect,
  editor,
}: {
  trip: Trip;
  index: number;
  selected: boolean;
  onSelect: () => void;
  editor: TripEditorState;
}) {
  const stage = trip.stages[index];
  const weather = useWeather(trip, index).data;
  if (!stage) return null;
  const isLast = index === trip.stages.length - 1;

  return (
    <StageCard
      day={index + 1}
      date={
        trip.startDate
          ? localTimeToDate(addDays(trip.startDate, index))
          : undefined
      }
      from={stage.start.name}
      to={stage.end.name}
      distance={stage.stats.distance}
      ascent={stage.stats.ascent}
      surface={stage.stats.surface}
      temperature={weather?.temperature}
      wind={weather ? stageWind(weather) : undefined}
      times={stageTimes(trip, index)}
      locked={stage.end.locked}
      onLockedChange={
        editor.readOnly
          ? undefined
          : (locked) => editor.setLocked(index, locked)
      }
      selected={selected}
      onSelect={onSelect}
      color={index % 2 ? "b" : "a"}
      alternatives={
        selected && !isLast && !editor.readOnly ? (
          <StopPicker trip={trip} index={index} editor={editor} />
        ) : undefined
      }
    >
      {!isLast && (
        <>
          <HotelPicker trip={trip} index={index} editor={editor} />
          <BookingLink trip={trip} index={index} />
        </>
      )}
    </StageCard>
  );
}
