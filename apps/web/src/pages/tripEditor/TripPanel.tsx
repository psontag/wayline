import {
  addDays,
  localTimeToDate,
  ridingHours,
  tripStats,
  type Trip,
} from "@wayline/domain";
import {
  DayCard,
  DayWeather,
  InlineEdit,
  NavRow,
  PanelHeader,
  PanelSection,
  RowList,
  StatTile,
  SurfaceBar,
  useFormat,
} from "@wayline/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWeather } from "../../data/queries";
import { DatesSection } from "./DatesSection";
import { isChanged } from "./routeEdits";
import { stageWind } from "./stageWeather";
import { TripMenu } from "./TripHeader";
import { useHasTrains } from "./TrainOptions";
import type { TripEditorState } from "./useTripEditor";

/** Trip level of the side panel: dates, totals, days and trains. */
export function TripPanel({
  trip,
  editor,
  hovered,
  onHover,
  onOpenDay,
}: {
  trip: Trip;
  editor: TripEditorState;
  hovered?: number;
  onHover: (index: number | undefined) => void;
  onOpenDay: (index: number) => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const [renaming, setRenaming] = useState(false);
  const stats = tripStats(trip.stages);
  const hours = trip.stages.reduce(
    (sum, s) => sum + ridingHours(s.stats, trip.settings.avgSpeed),
    0,
  );
  const there = useHasTrains(trip, "there");
  const home = useHasTrains(trip, "back");
  const start = trip.stages[0]?.start.name ?? "";
  const end = trip.stages.at(-1)?.end.name ?? "";

  return (
    <>
      <PanelHeader
        title={
          renaming ? (
            <InlineEdit
              value={trip.name}
              aria-label={t("header.renameLabel")}
              onCommit={(name) => {
                editor.rename(name);
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            trip.name
          )
        }
        actions={
          <TripMenu
            trip={trip}
            editor={editor}
            onRename={() => setRenaming(true)}
          />
        }
      />
      <DatesSection trip={trip} editor={editor} />
      <PanelSection
        icon="trip"
        title={t("section.trip")}
        summary={t("trip.summary", {
          kind: t(`kind.${trip.kind}`),
          days: t("summary.stageCount", { count: trip.stages.length }),
        })}
      >
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            icon="distance"
            label={t("summary.distance")}
            value={format.distance(stats.distance)}
          />
          <StatTile
            icon="ascent"
            label={t("summary.ascent")}
            value={format.elevation(stats.ascent)}
          />
          <StatTile
            icon="ridingTime"
            label={t("summary.ridingTime")}
            value={format.duration(hours)}
          />
        </div>
        <SurfaceBar shares={stats.surface} caption />
      </PanelSection>
      <PanelSection
        icon="days"
        title={t("section.days")}
        summary={t("days.hint")}
      >
        {trip.stages.map((stage, index) => (
          <DayItem
            key={stage.id}
            trip={trip}
            index={index}
            highlighted={hovered === index}
            onHover={(on) => onHover(on ? index : undefined)}
            onOpen={() => onOpenDay(index)}
          />
        ))}
      </PanelSection>
      {(there || home) && (
        <PanelSection icon="trains" title={t("section.trains")}>
          <RowList>
            {there && (
              <NavRow
                title={t("section.gettingThere")}
                detail={t("trains.to", { station: start })}
                onClick={() => onOpenDay(0)}
              />
            )}
            {home && (
              <NavRow
                title={t("section.gettingHome")}
                detail={t("trains.from", { station: end })}
                onClick={() => onOpenDay(trip.stages.length - 1)}
              />
            )}
          </RowList>
        </PanelSection>
      )}
    </>
  );
}

function DayItem({
  trip,
  index,
  highlighted,
  onHover,
  onOpen,
}: {
  trip: Trip;
  index: number;
  highlighted: boolean;
  onHover: (on: boolean) => void;
  onOpen: () => void;
}) {
  const format = useFormat();
  const weather = useWeather(trip, index).data;
  const stage = trip.stages[index];
  if (!stage) return null;
  const isLast = index === trip.stages.length - 1;

  return (
    <DayCard
      label={String(index + 1)}
      date={
        trip.startDate
          ? format.date(localTimeToDate(addDays(trip.startDate, index)))
          : undefined
      }
      place={stage.end.name}
      color={index % 2 ? "stage-b" : "stage-a"}
      distance={format.distance(stage.stats.distance)}
      ascent={format.elevation(stage.stats.ascent)}
      ridingTime={format.duration(
        ridingHours(stage.stats, trip.settings.avgSpeed),
      )}
      weather={
        weather && (
          <DayWeather
            temperature={weather.temperature}
            rain={weather.maxPrecipitation}
            wind={stageWind(weather)}
          />
        )
      }
      hotel={isLast ? undefined : stage.hotel?.name}
      locked={!isLast && stage.end.locked}
      changed={isChanged(trip, index)}
      highlighted={highlighted}
      onClick={onOpen}
      onHoverChange={onHover}
    />
  );
}
