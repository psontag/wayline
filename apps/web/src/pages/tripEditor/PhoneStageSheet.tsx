import {
  addDays,
  bahnUrl,
  localTimeToDate,
  ridingHours,
  type RouteNetwork,
  type Trip,
} from "@wayline/domain";
import {
  Button,
  Chip,
  DayWeather,
  LinkRow,
  Stat,
  statIcons,
  SurfaceBar,
  TextLink,
  useFormat,
} from "@wayline/ui";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWeather } from "../../data/queries";
import { BookingLink } from "./BookingLink";
import { downloadTripGpx } from "../../data/gpx";
import { StageChange } from "./StageList";
import { StageProfile } from "./StageProfile";
import type { TripEditorState } from "./useTripEditor";
import { forecastFrom, stageWind } from "./stageWeather";

export type PhoneStageSheetProps = {
  trip: Trip;
  selected: number;
  onSelect: (index: number) => void;
  network?: RouteNetwork;
  hoverKm?: number;
  onHoverKm: (km: number | undefined) => void;
  onOpenStop: () => void;
  editor: TripEditorState;
};

/** Sheet content: day picker and the selected stage. */
export function PhoneStageSheet({
  trip,
  selected,
  onSelect,
  network,
  hoverKm,
  onHoverKm,
  onOpenStop,
  editor,
}: PhoneStageSheetProps) {
  const { t } = useTranslation("tripEditor");
  const { t: tUi } = useTranslation("ui");
  const format = useFormat();
  const weather = useWeather(trip, selected);
  const stage = trip.stages[selected];
  if (!stage) return null;

  const isFirst = selected === 0;
  const isLast = selected === trip.stages.length - 1;
  const date = trip.startDate && addDays(trip.startDate, selected);
  const { hotel } = stage;

  let fallback: string;
  if (!date) fallback = t("phone.noStartDate");
  else if (weather.isPending) fallback = t("phone.loading");
  else {
    fallback = t("phone.forecastFrom", {
      date: format.date(localTimeToDate(forecastFrom(date))),
    });
  }
  const data = weather.data;

  return (
    <>
      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3">
        {trip.stages.map((s, index) => (
          <Chip
            key={s.id}
            size="md"
            selected={index === selected}
            onClick={() => onSelect(index)}
          >
            {t("phone.day", { day: index + 1 })}
          </Chip>
        ))}
      </div>

      {/* Bottom padding: at full height the lowest part of the sheet is
          off screen. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-4 pb-24">
        <div className="flex flex-col gap-1.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-text-muted">
              {date
                ? t("phone.dayDate", {
                    day: selected + 1,
                    date: format.date(localTimeToDate(date)),
                  })
                : t("phone.day", { day: selected + 1 })}
            </span>
            <h2 className="text-lg font-extrabold">
              {t("phone.route", {
                from: stage.start.name,
                to: stage.end.name,
              })}
            </h2>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Stat
              icon="distance"
              value={format.distance(stage.stats.distance)}
              label={t("summary.distance")}
            />
            <Stat
              icon="ascent"
              value={format.elevation(stage.stats.ascent)}
              label={t("summary.ascent")}
            />
            <Stat
              icon="ridingTime"
              value={format.duration(
                ridingHours(stage.stats, trip.settings.avgSpeed),
              )}
              label={t("summary.ridingTime")}
            />
          </div>
        </div>

        <SurfaceBar shares={stage.stats.surface} caption />

        {data ? (
          <DayWeather
            temperature={data.temperature}
            feelsLike={data.feelsLike.min}
            rain={data.maxPrecipitation}
            wind={stageWind(data)}
          />
        ) : (
          <p className="text-sm text-text-muted">{fallback}</p>
        )}

        <StageChange trip={trip} index={selected} editor={editor} />
        {!isLast && (
          <LinkRow
            icon={<statIcons.beds aria-hidden />}
            title={t("phone.stop", { place: stage.end.name })}
            subtitle={
              hotel ? (
                <span className="flex items-center gap-2">
                  <span className="truncate">{hotel.name}</span>
                  {!!hotel.stars && (
                    <Stat
                      size="sm"
                      icon="stars"
                      value={String(hotel.stars)}
                      label={tUi("hotel.stars", { count: hotel.stars })}
                      className="font-normal text-text-muted"
                    />
                  )}
                </span>
              ) : (
                t("phone.noHotel")
              )
            }
            onClick={onOpenStop}
          />
        )}
        {!isLast && (
          <BookingLink trip={trip} index={selected} variant="button" />
        )}

        {isFirst && stage.start.kind === "station" && (
          <TextLink
            href={bahnUrl({ from: "", to: stage.start.name })}
            target="_blank"
            rel="noreferrer"
          >
            <statIcons.train aria-hidden />
            {t("summary.trainTo", { station: stage.start.name })}
          </TextLink>
        )}
        {isLast && stage.end.kind === "station" && (
          <TextLink
            href={bahnUrl({ from: stage.end.name, to: "" })}
            target="_blank"
            rel="noreferrer"
          >
            <statIcons.train aria-hidden />
            {t("summary.trainFrom", { station: stage.end.name })}
          </TextLink>
        )}

        <StageProfile
          key={stage.id}
          trip={trip}
          index={selected}
          network={network}
          hoverKm={hoverKm}
          onHoverKm={onHoverKm}
          variant="sheet"
          onRideStartChange={
            editor.readOnly
              ? undefined
              : (start) => editor.setRideStart(selected, start)
          }
        />

        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() =>
            downloadTripGpx({
              ...trip,
              name: t("phone.stageFileName", {
                name: trip.name,
                day: selected + 1,
              }),
              stages: [stage],
            })
          }
        >
          <Download aria-hidden />
          {t("phone.exportStage")}
        </Button>
      </div>
    </>
  );
}
