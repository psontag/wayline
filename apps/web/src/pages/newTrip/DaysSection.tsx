import { addDays, localTimeToDate } from "@wayline/domain";
import {
  Button,
  Chip,
  DateField,
  ForecastDays,
  FormField,
  PanelSection,
  Select,
  useFormat,
} from "@wayline/ui";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { dayOptions } from "./form";
import { FORECAST_DAYS, type Rain, ROUGH_AFTER_DAYS } from "./whereWeather";

/** Trip lengths as chips next to the forecast. Others are in "Other dates". */
const lengthChips = [2, 3, 4, 5];

/**
 * Where step: the 16 forecast days, how many areas are dry on each, and the
 * trip days on them. A click on a day moves the trip there.
 */
export function DaysSection({
  now,
  startDate,
  days,
  onStartDate,
  onDays,
  counts,
  loading,
  failed,
}: {
  now: string;
  startDate: string;
  days: number;
  onStartDate: (date: string) => void;
  onDays: (days: number) => void;
  /** Areas dry, with showers and wet on each forecast day. */
  counts: Record<Rain, number>[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const id = useId();
  const [other, setOther] = useState(false);
  const first = format.date(localTimeToDate(startDate));
  const last = format.date(localTimeToDate(addDays(startDate, days - 1)));
  const lastDay = addDays(startDate, days - 1);
  const inForecast = startDate < addDays(now, FORECAST_DAYS);

  const fields = (
    <div className="grid grid-cols-2 gap-3">
      <FormField label={t("when.firstDay")} htmlFor={`${id}-date`}>
        <DateField
          id={`${id}-date`}
          min={now}
          value={startDate}
          onValueChange={(date) => date && onStartDate(date)}
        />
      </FormField>
      <FormField label={t("where.days")} htmlFor={`${id}-days`}>
        <Select
          id={`${id}-days`}
          value={String(days)}
          onValueChange={(v) => onDays(Number(v))}
          options={dayOptions.map((n) => ({
            value: String(n),
            label: t("where.dayCount", { count: n }),
          }))}
        />
      </FormField>
    </div>
  );

  return (
    <PanelSection
      icon="dates"
      title={t("where.days")}
      summary={days === 1 ? first : t("where.range", { first, last })}
    >
      {counts ? (
        <ForecastDays
          aria-label={t("where.forecast")}
          onPick={(i) => onStartDate(addDays(now, i))}
          days={counts.map((c, i) => {
            const date = addDays(now, i);
            const d = localTimeToDate(date);
            const weekday = d.getDay();
            return {
              weekday: format.weekday(d).slice(0, 1),
              day: String(d.getDate()),
              label: t("where.dayRain", { date: format.date(d), ...c }),
              counts: c,
              rough: i > ROUGH_AFTER_DAYS,
              weekend: weekday === 0 || weekday === 6,
              selected: date >= startDate && date <= lastDay,
            };
          })}
        />
      ) : (
        (loading || failed) && (
          <p className="text-sm text-text-muted" role="status">
            {loading ? t("weather.loading") : t("weather.unavailable")}
          </p>
        )
      )}
      {counts && !inForecast && (
        <p className="text-xs text-text-muted">{t("weather.past")}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label={t("where.length")}
          className="flex flex-wrap gap-1.5"
        >
          {lengthChips.map((n) => (
            <Chip key={n} selected={days === n} onClick={() => onDays(n)}>
              {t("where.dayCount", { count: n })}
            </Chip>
          ))}
        </div>
        {counts && !other && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOther(true)}
          >
            {t("where.otherDates")}
          </Button>
        )}
      </div>
      {(other || !counts) && fields}
    </PanelSection>
  );
}
