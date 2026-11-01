import {
  addDays,
  headwindShare,
  localTimeToDate,
  type StageWeather,
  type Trip,
  WIND_GAIN,
  type WindDay,
} from "@wayline/domain";
import { ChangeNotice, useFormat, WindDateStrip } from "@wayline/ui";
import { Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTripsWeather, useTripWeather } from "../../data/queries";
import type { TripEditorState } from "./useTripEditor";

/** Start dates to compare, in days from the planned one. */
const SHIFTS = [-2, -1, 0, 1, 2];

/** Headwind now, the other way round and on nearby start dates. */
export function useWindOptions(trip: Trip) {
  const now = useTripWeather(trip);
  const back = useTripWeather(trip, !!now.data, "reversed");

  const today = localToday();
  const dates = trip.startDate
    ? SHIFTS.map((d) => addDays(trip.startDate as string, d)).filter(
        (date) => date >= today,
      )
    : [];
  const shifted = dates.map((startDate) => ({ ...trip, startDate }));
  const dateWeather = useTripsWeather(now.data ? shifted : []);

  const share = now.data ? headwindShare(windDays(now.data, trip)) : undefined;
  const backShare = back.data
    ? headwindShare(
        windDays(back.data, { ...trip, stages: [...trip.stages].reverse() }),
      )
    : undefined;
  const reverseHelps =
    share !== undefined &&
    backShare !== undefined &&
    share - backShare >= WIND_GAIN;

  const options = dates.map((date, i) => {
    const days = dateWeather[i];
    const dayShares = days ? windDays(days, trip) : undefined;
    return {
      date,
      headwind: dayShares && headwindShare(dayShares),
      wind: dayShares && overall(dayShares),
    };
  });
  const best = options.reduce<(typeof options)[number] | undefined>(
    (a, o) =>
      o.headwind !== undefined && (!a || o.headwind < (a.headwind ?? 1))
        ? o
        : a,
    undefined,
  );
  const dateHelps =
    share !== undefined &&
    !!best &&
    best.date !== trip.startDate &&
    share - (best.headwind ?? 1) >= WIND_GAIN;

  return { share, backShare, reverseHelps, options, best, dateHelps };
}

/**
 * Ways to ride with less headwind: the other way round, or on another
 * start date. Shows only when one of them cuts the headwind a lot.
 */
export function WindAdvice({
  trip,
  editor,
}: {
  trip: Trip;
  editor: TripEditorState;
}) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const { share, backShare, reverseHelps, options, best, dateHelps } =
    useWindOptions(trip);

  // Suggestions are for the owner; shared viewers can't apply them.
  if (share === undefined || editor.readOnly) return null;
  if (!reverseHelps && !dateHelps) return null;

  const first = trip.stages[0]?.start.name ?? "";
  const last = trip.stages.at(-1)?.end.name ?? "";
  const loop = first === last;
  const percent = (value: number) => format.percent(value);
  const dateLabel = (date: string) => format.date(localTimeToDate(date));

  return (
    <section className="flex flex-col gap-2" aria-label={t("wind.title")}>
      {reverseHelps && (
        <ChangeNotice
          icon={<Wind className="size-4 shrink-0" aria-hidden />}
          title={
            loop
              ? t("wind.reverseLoop")
              : t("wind.reverseTrip", { from: last, to: first })
          }
          detail={[
            t("wind.reverseDetail", {
              after: percent(backShare ?? 0),
              before: percent(share),
            }),
            ...(loop ? [] : [t("wind.reverseTrains")]),
          ].join(". ")}
          actionLabel={t("wind.switch")}
          onAction={editor.reverse}
          disabled={!editor.canEdit}
        />
      )}
      {dateHelps && best && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm">
            {t("wind.betterDate", {
              date: dateLabel(best.date),
              after: percent(best.headwind ?? 0),
              before: percent(share),
            })}
          </p>
          <WindDateStrip
            aria-label={t("wind.dates")}
            options={options.map((o) => ({
              label: dateLabel(o.date),
              current: o.date === trip.startDate,
              ...(o.headwind !== undefined && { headwind: o.headwind }),
              ...(o.wind && { wind: o.wind }),
              ...(editor.canEdit && {
                onSelect: () =>
                  editor.setStartDate(
                    o.date,
                    t("note.dateMoved", { date: dateLabel(o.date) }),
                  ),
              }),
            }))}
          />
        </div>
      )}
    </section>
  );
}

function windDays(days: StageWeather[], trip: Trip): WindDay[] {
  return days.map((d, i) => ({
    wind: d.wind,
    distance: trip.stages[i]?.stats.distance ?? 0,
  }));
}

/** Head, cross and tail shares over the whole trip. */
function overall(days: WindDay[]) {
  const total = days.reduce((sum, d) => sum + d.distance, 0) || 1;
  const sum = (key: "head" | "cross" | "tail") =>
    days.reduce((s, d) => s + d.wind[key] * d.distance, 0) / total;
  return { head: sum("head"), cross: sum("cross"), tail: sum("tail") };
}

/** "YYYY-MM-DD" in local time. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
