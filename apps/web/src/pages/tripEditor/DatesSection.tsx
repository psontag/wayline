import { addDays, localTimeToDate, type Trip } from "@wayline/domain";
import {
  ChangeNotice,
  ChoiceList,
  DateButton,
  PanelSection,
  Stat,
  useFormat,
} from "@wayline/ui";
import { Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TripEditorState } from "./useTripEditor";
import { useWindOptions } from "./WindAdvice";

/** Start date with the headwind on nearby dates, and wind tips. */
export function DatesSection({
  trip,
  editor,
}: {
  trip: Trip;
  editor: TripEditorState;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const wind = useWindOptions(trip);
  const days = trip.stages.length;
  const dateLabel = (date: string) => format.date(localTimeToDate(date));
  const range = (start: string) =>
    days > 1
      ? t("dates.range", {
          from: dateLabel(start),
          to: dateLabel(addDays(start, days - 1)),
        })
      : dateLabel(start);
  const moveTo = (date: string) =>
    editor.setStartDate(date, t("note.dateMoved", { date: dateLabel(date) }));

  const first = trip.stages[0]?.start.name ?? "";
  const last = trip.stages.at(-1)?.end.name ?? "";
  const loop = first === last;
  const share = wind.share;
  const tips = !editor.readOnly && share !== undefined && (
    <>
      {wind.reverseHelps && (
        <ChangeNotice
          icon={<Wind className="size-4 shrink-0" aria-hidden />}
          title={
            loop
              ? t("wind.reverseLoop")
              : t("wind.reverseTrip", { from: last, to: first })
          }
          detail={t("wind.reverseDetail", {
            after: format.percent(wind.backShare ?? 0),
            before: format.percent(share),
          })}
          actionLabel={t("wind.switch")}
          onAction={editor.reverse}
          disabled={!editor.canEdit}
        />
      )}
      {wind.dateHelps && wind.best && (
        <ChangeNotice
          icon={<Wind className="size-4 shrink-0" aria-hidden />}
          title={t("dates.tip", { date: dateLabel(wind.best.date) })}
          detail={t("wind.reverseDetail", {
            after: format.percent(wind.best.headwind ?? 0),
            before: format.percent(share),
          })}
          actionLabel={t("dates.try")}
          onAction={() => wind.best && moveTo(wind.best.date)}
          disabled={!editor.canEdit}
        />
      )}
    </>
  );

  return (
    <PanelSection
      icon="dates"
      title={t("section.dates")}
      summary={
        trip.startDate
          ? t("dates.summary", {
              range: range(trip.startDate),
              time: trip.settings.startTime,
            })
          : t("header.setStartDate")
      }
      collapsible
      defaultOpen={!trip.startDate}
      notice={tips}
    >
      {trip.startDate && wind.options.length > 0 && (
        <ChoiceList
          aria-label={t("header.startDate")}
          value={trip.startDate}
          onValueChange={editor.readOnly ? undefined : moveTo}
          disabled={!editor.canEdit}
          options={wind.options.map((o) => ({
            id: o.date,
            title: range(o.date),
            detail: (
              <Stat
                size="sm"
                icon="wind"
                muted
                label={t("wind.title")}
                value={
                  o.headwind === undefined
                    ? t("dates.noForecast")
                    : t("dates.headwind", { share: format.percent(o.headwind) })
                }
              />
            ),
            ...(o === wind.best &&
              wind.options.length > 1 && { tag: t("dates.leastHeadwind") }),
          }))}
        />
      )}
      <DateButton
        value={trip.startDate}
        onChange={editor.setStartDate}
        disabled={!editor.canEdit}
        aria-label={t("header.startDate")}
      >
        {trip.startDate ? t("dates.other") : t("header.setStartDate")}
      </DateButton>
    </PanelSection>
  );
}
