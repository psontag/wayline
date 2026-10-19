import type { Place, Trip } from "@wayline/domain";
import { Chip, useFormat } from "@wayline/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { distanceIfEndingAt } from "./edits";
import type { TripEditorState } from "./useTripEditor";

export type StopOption = { place: Place; distance: number; current: boolean };

/** The stop and its alternatives, shortest stage first. */
export function useStopOptions(trip: Trip, index: number): StopOption[] {
  return useMemo(() => {
    const stage = trip.stages[index];
    if (!stage) return [];
    const next = trip.stages[index + 1];
    const options = [
      { place: stage.end, distance: stage.stats.distance, current: true },
      ...stage.end.alternatives.map((place) => ({
        place,
        distance: distanceIfEndingAt(stage, next, place.coord),
        current: false,
      })),
    ];
    return options.sort((a, b) => a.distance - b.distance);
  }, [trip, index]);
}

/** Chips to move the stop to another town. */
export function StopPicker({
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
  const options = useStopOptions(trip, index);
  return options.map(({ place, distance, current }) => (
    <Chip
      key={place.name}
      selected={current}
      disabled={!current && !editor.canEdit}
      onClick={() => !current && void editor.moveStop(index, place)}
    >
      {t("stage.alternative", {
        name: place.name,
        distance: format.distance(distance),
      })}
    </Chip>
  ));
}
