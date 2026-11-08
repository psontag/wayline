import {
  addDays,
  findClimbs,
  type LonLat,
  localTimeToDate,
  ridingHours,
  routePoints,
  type Stage,
  type Trip,
} from "@wayline/domain";
import {
  Button,
  Chip,
  ClimbList,
  DayWeather,
  PanelHeader,
  PanelSection,
  Stat,
  SurfaceBar,
  useFormat,
  ViaRow,
} from "@wayline/ui";
import { ChevronLeft, Lock, LockOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useWeather } from "../../data/queries";
import { BookingLink } from "./BookingLink";
import { DestinationSection } from "./DestinationSection";
import { HotelChoices } from "./HotelChoices";
import { StageChange } from "./StageChange";
import { dayWarnings, stageWind } from "./stageWeather";
import { hasMovableDestination } from "./stopChoices";
import { StopPicker } from "./StopPicker";
import { TrainOptions, useHasTrains } from "./TrainOptions";
import type { TripEditorState } from "./useTripEditor";

/** Day level of the side panel: trains, ride, stop and hotel of one day. */
export function DayPanel({
  trip,
  index,
  editor,
  onSelect,
  onBack,
  onHoverClimb,
  highlightedClimb,
  onHighlightProposed,
  findingDestination,
  onFindingDestination,
  selectedVia,
  onSelectVia,
  chart,
}: {
  /** Phones: elevation and weather, right under the header. */
  chart?: ReactNode;
  trip: Trip;
  index: number;
  editor: TripEditorState;
  onSelect: (index: number) => void;
  onBack: () => void;
  /** Climb of the day under the pointer. */
  onHoverClimb?: (index: number | undefined) => void;
  /** Climb to show stronger, e.g. the one under the chart crosshair. */
  highlightedClimb?: number;
  /** Called with true while the change notice is under the pointer. */
  onHighlightProposed?: (on: boolean) => void;
  /** Other train stops to end the last day at show here and on the map. */
  findingDestination: boolean;
  onFindingDestination: (finding: boolean) => void;
  /** Via point selected here and on the map. */
  selectedVia?: number;
  onSelectVia: (index: number | undefined) => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const weather = useWeather(trip, index).data;
  const there = useHasTrains(trip, "there");
  const home = useHasTrains(trip, "back");
  const stage = trip.stages[index];
  if (!stage) return null;
  const isFirst = index === 0;
  const isLast = index === trip.stages.length - 1;
  const date =
    trip.startDate &&
    format.date(localTimeToDate(addDays(trip.startDate, index)));
  const { surface } = stage.stats;
  const locked = stage.end.locked;

  return (
    <>
      <PanelHeader
        nav={
          <>
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft aria-hidden />
              {t("panel.allDays")}
            </Button>
            <div className="flex-1" />
            <div
              role="group"
              aria-label={t("panel.days")}
              className="flex gap-1"
            >
              {trip.stages.map((s, i) => (
                <Chip
                  key={s.id}
                  selected={i === index}
                  aria-label={t("panel.day", { day: i + 1 })}
                  onClick={() => onSelect(i)}
                >
                  {i + 1}
                </Chip>
              ))}
            </div>
          </>
        }
        color={index % 2 ? "stage-b" : "stage-a"}
        eyebrow={
          date
            ? t("day.eyebrowDate", {
                day: index + 1,
                date,
                from: stage.start.name,
              })
            : t("day.eyebrow", { day: index + 1, from: stage.start.name })
        }
        title={t("day.title", { place: stage.end.name })}
        stats={
          <>
            <Stat
              icon="distance"
              label={t("summary.distance")}
              value={format.distance(stage.stats.distance)}
            />
            <Stat
              icon="ascent"
              label={t("summary.ascent")}
              value={format.elevation(stage.stats.ascent)}
            />
            <Stat
              icon="ridingTime"
              label={t("summary.ridingTime")}
              value={format.duration(
                ridingHours(stage.stats, trip.settings.avgSpeed),
              )}
            />
          </>
        }
        notice={
          <StageChange
            trip={trip}
            index={index}
            editor={editor}
            onHighlight={onHighlightProposed}
          />
        }
      />
      {chart && <div className="border-b border-border p-4">{chart}</div>}
      {isFirst && there && (
        <PanelSection
          icon="trains"
          title={t("section.gettingThere")}
          summary={t("trains.arriveBy", { time: trip.settings.startTime })}
          collapsible
        >
          <TrainOptions trip={trip} direction="there" editor={editor} />
        </PanelSection>
      )}
      <PanelSection
        icon="ride"
        title={t("section.ride")}
        summary={t("ride.summary", { share: format.percent(surface.paved) })}
        collapsible
      >
        {!editor.readOnly && stage.via.length > 0 && (
          <ViaList
            stage={stage}
            selected={selectedVia}
            onSelect={onSelectVia}
            onRemove={(coord) => {
              onSelectVia(undefined);
              void editor.removeVia(index, coord);
            }}
          />
        )}
        <SurfaceBar shares={surface} caption="rest" />
        {weather && (
          <DayWeather
            temperature={weather.temperature}
            feelsLike={weather.feelsLike.min}
            rain={weather.maxPrecipitation}
            wind={stageWind(weather)}
            warnings={dayWarnings(t, format, trip, index, weather)}
          />
        )}
        <ClimbList
          climbs={findClimbs(routePoints(stage.legs))}
          onHoverClimb={onHoverClimb}
          highlighted={highlightedClimb}
        />
      </PanelSection>
      {!isLast && (
        <PanelSection
          icon="stop"
          title={t("section.stop")}
          summary={
            locked
              ? t("stop.summaryLocked", { place: stage.end.name })
              : stage.end.name
          }
          collapsible
        >
          {!editor.readOnly && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-text-muted">
                {t("stop.hint")}
              </span>
              <Button
                size="sm"
                aria-pressed={locked}
                disabled={!editor.canEdit}
                onClick={() => editor.setLocked(index, !locked)}
              >
                {locked ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
                {locked ? t("stage.locked") : t("stage.lock")}
              </Button>
            </div>
          )}
          {!editor.readOnly && (
            <StopPicker trip={trip} index={index} editor={editor} />
          )}
        </PanelSection>
      )}
      {!isLast && (
        <PanelSection
          icon="hotel"
          title={t("section.hotel")}
          summary={stage.hotel?.name ?? t("stage.noHotel")}
          collapsible
        >
          <HotelChoices trip={trip} index={index} editor={editor} />
          <BookingLink trip={trip} index={index} />
        </PanelSection>
      )}
      {isLast && !editor.readOnly && hasMovableDestination(trip) && (
        <DestinationSection
          trip={trip}
          index={index}
          editor={editor}
          finding={findingDestination}
          onFindingChange={onFindingDestination}
        />
      )}
      {isLast && home && (
        <PanelSection
          icon="trains"
          title={t("section.gettingHome")}
          summary={t("trains.from", { station: stage.end.name })}
          collapsible
        >
          <TrainOptions trip={trip} direction="back" editor={editor} />
        </PanelSection>
      )}
    </>
  );
}

/** Via points of a day, in route order, with the km where each one is. */
function ViaList({
  stage,
  selected,
  onSelect,
  onRemove,
}: {
  stage: Stage;
  selected?: number;
  onSelect: (index: number | undefined) => void;
  onRemove: (coord: LonLat) => void;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  // Via point i is where leg i ends.
  const at = stage.via.map((_, i) =>
    stage.legs.slice(0, i + 1).reduce((sum, leg) => sum + leg.distance, 0),
  );
  return (
    <ul aria-label={t("via.list")} className="flex flex-col gap-1">
      {stage.via.map((via, i) => {
        const km = at[i] ?? 0;
        return (
          <li key={i}>
            <ViaRow
              n={i + 1}
              name={t("via.name", { n: i + 1 })}
              detail={t("via.at", { distance: format.distance(km) })}
              selected={i === selected}
              onSelect={() => onSelect(i === selected ? undefined : i)}
              removeLabel={t("via.removeLabel", { n: i + 1 })}
              onRemove={() => onRemove(via.coord)}
            />
          </li>
        );
      })}
    </ul>
  );
}
