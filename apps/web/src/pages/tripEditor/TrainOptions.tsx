import {
  bahnUrl,
  type Connection,
  localTimeToDate,
  trainQueries,
  type Trip,
} from "@wayline/domain";
import { Button, statIcons, TextLink, TrainRow } from "@wayline/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHomeStation } from "../../data/homeStation";
import { useTrainOptions } from "../../data/queries";
import { sameTrain } from "./edits";
import type { TripEditorState } from "./useTripEditor";

/**
 * Trains from home to the start, or from the end back home: a bahn.de
 * link, the saved connections and, on request, a few more. Only at
 * stations.
 */
export function TrainOptions({
  trip,
  direction,
  editor,
  defaultOpen = false,
}: {
  trip: Trip;
  direction: Connection["direction"];
  editor: TripEditorState;
  /** Looks up the trains right away. */
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation("tripEditor");
  const [home] = useHomeStation();
  const query = trainQueries(trip, home)[direction];
  // Look up trains only on request: the timetable API is rate-limited.
  const [open, setOpen] = useState(defaultOpen);
  const found = useTrainOptions(open ? query : undefined);
  const station =
    direction === "there" ? trip.stages[0]?.start : trip.stages.at(-1)?.end;
  if (!query || station?.kind !== "station") return null;

  const saved = trip.trains.filter((train) => train.direction === direction);
  const rows = [
    ...saved,
    ...(open ? (found.data ?? []) : [])
      .map((option) => ({ ...option, direction }))
      .filter((option) => !saved.some((s) => sameTrain(s, option))),
  ].sort((a, b) => a.departure.localeCompare(b.departure));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <TextLink href={bahnUrl(query)} target="_blank" rel="noreferrer">
          <statIcons.train aria-hidden />
          {t(direction === "there" ? "summary.trainTo" : "summary.trainFrom", {
            station: station.name,
          })}
        </TextLink>
        {query.time && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {t(open ? "trains.hide" : "trains.show")}
            {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>
        )}
      </div>
      {found.isLoading && (
        <p className="text-xs text-text-muted">{t("trains.loading")}</p>
      )}
      {found.isError && (
        <p className="text-xs text-text-muted">{t("trains.unavailable")}</p>
      )}
      {rows.length > 0 && (
        <div className="-mx-2 flex flex-col">
          {rows.map((train) => (
            <TrainRow
              key={`${train.departure}|${train.lines.join()}`}
              departure={localTimeToDate(train.departure)}
              arrival={localTimeToDate(train.arrival)}
              changes={train.changes}
              lines={train.lines}
              href={bahnUrl({
                from: query.from,
                to: query.to,
                time: train.departure,
              })}
              saved={saved.includes(train)}
              {...(editor.canEdit && {
                onToggleSave: () => editor.toggleTrain(train),
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** True when TrainOptions has something to show for this direction. */
export function useHasTrains(trip: Trip, direction: Connection["direction"]) {
  const [home] = useHomeStation();
  const station =
    direction === "there" ? trip.stages[0]?.start : trip.stages.at(-1)?.end;
  return !!trainQueries(trip, home)[direction] && station?.kind === "station";
}
