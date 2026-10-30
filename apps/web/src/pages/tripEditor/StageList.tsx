import {
  addDays,
  findClimbs,
  localTimeToDate,
  ridingHours,
  routePoints,
  type Trip,
} from "@wayline/domain";
import {
  ChangeNotice,
  ClimbList,
  DayList,
  StageDetails,
  useFormat,
} from "@wayline/ui";
import { useTranslation } from "react-i18next";
import { useWeather } from "../../data/queries";
import { BookingLink } from "./BookingLink";
import { HotelPicker } from "./HotelPicker";
import { stageWind } from "./stageWeather";
import { isChanged } from "./routeEdits";
import { StopPicker } from "./StopPicker";
import type { TripEditorState } from "./useTripEditor";

export type StageListProps = {
  trip: Trip;
  selected: number;
  onSelect: (index: number) => void;
  onHover: (index: number | undefined) => void;
  editor: TripEditorState;
};

/** All days as a timeline. The selected one shows stop, hotel and booking. */
export function StageList({
  trip,
  selected,
  onSelect,
  onHover,
  editor,
}: StageListProps) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const { avgSpeed } = trip.settings;

  return (
    <DayList
      className="p-3"
      start={trip.stages[0]?.start.name}
      days={trip.stages.map((stage, index) => ({
        label: String(index + 1),
        place: stage.end.name,
        date: trip.startDate
          ? format.date(localTimeToDate(addDays(trip.startDate, index)))
          : undefined,
        distance: format.distance(stage.stats.distance),
        ascent: format.elevation(stage.stats.ascent),
        ridingTime: format.duration(ridingHours(stage.stats, avgSpeed)),
        tag: isChanged(trip, index)
          ? t("stage.changed")
          : stage.end.locked
            ? t("stage.locked")
            : undefined,
      }))}
      selectedDay={selected + 1}
      onSelectDay={(day) => onSelect(day - 1)}
      onHoverDay={(day) => onHover(day === undefined ? undefined : day - 1)}
      details={<SelectedStage trip={trip} index={selected} editor={editor} />}
    />
  );
}

function SelectedStage({
  trip,
  index,
  editor,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
}) {
  const stage = trip.stages[index];
  const weather = useWeather(trip, index).data;
  if (!stage) return null;
  const isLast = index === trip.stages.length - 1;

  return (
    <StageDetails
      surface={stage.stats.surface}
      climbs={<ClimbList climbs={findClimbs(routePoints(stage.legs))} />}
      weather={
        weather
          ? {
              temperature: weather.temperature,
              feelsLike: weather.feelsLike.min,
              rain: weather.maxPrecipitation,
              wind: stageWind(weather),
            }
          : undefined
      }
      locked={stage.end.locked}
      onLockedChange={
        editor.readOnly
          ? undefined
          : (locked) => editor.setLocked(index, locked)
      }
      alternatives={
        !isLast && !editor.readOnly ? (
          <StopPicker trip={trip} index={index} editor={editor} />
        ) : undefined
      }
    >
      <StageChange trip={trip} index={index} editor={editor} />
      {!isLast && (
        <>
          <HotelPicker trip={trip} index={index} editor={editor} />
          <BookingLink trip={trip} index={index} />
        </>
      )}
    </StageDetails>
  );
}

/** Says how a stage differs from its proposal, with a way back. */
export function StageChange({
  trip,
  index,
  editor,
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stage = trip.stages[index];
  const proposed = trip.proposed?.[index];
  if (!stage || !proposed || !isChanged(trip, index) || editor.readOnly) {
    return null;
  }
  const diff = stage.stats.distance - proposed.stats.distance;
  const distance = format.distance(Math.abs(diff));
  return (
    <ChangeNotice
      title={t("stage.changed")}
      detail={
        Math.abs(diff) < 500
          ? undefined
          : t(diff > 0 ? "stage.longer" : "stage.shorter", { distance })
      }
      actionLabel={t("stage.revert")}
      onAction={() => void editor.revert(index)}
      disabled={!editor.canEdit}
    />
  );
}
