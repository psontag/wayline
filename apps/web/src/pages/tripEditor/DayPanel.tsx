import {
  addDays,
  findClimbs,
  localTimeToDate,
  ridingHours,
  routePoints,
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
} from "@wayline/ui";
import { ChevronLeft, Lock, LockOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWeather } from "../../data/queries";
import { BookingLink } from "./BookingLink";
import { HotelChoices } from "./HotelChoices";
import { StageChange } from "./StageChange";
import { stageWind } from "./stageWeather";
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
}: {
  trip: Trip;
  index: number;
  editor: TripEditorState;
  onSelect: (index: number) => void;
  onBack: () => void;
  /** Climb of the day under the pointer. */
  onHoverClimb?: (index: number | undefined) => void;
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
        notice={<StageChange trip={trip} index={index} editor={editor} />}
      />
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
        <SurfaceBar shares={surface} caption />
        {weather && (
          <DayWeather
            temperature={weather.temperature}
            feelsLike={weather.feelsLike.min}
            rain={weather.maxPrecipitation}
            wind={stageWind(weather)}
          />
        )}
        <ClimbList
          climbs={findClimbs(routePoints(stage.legs))}
          onHoverClimb={onHoverClimb}
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
