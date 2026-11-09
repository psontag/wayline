import { localTimeToDate } from "@wayline/domain";
import { FormField, PanelSection, Select, useFormat } from "@wayline/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { daysOut, ROUGH_AFTER_DAYS, type WhereWeather } from "./whereWeather";

/** Where step: rain and wind for the trip days, one day on the map. */
export function WeatherSection({
  weather,
  loading,
  past,
  today,
  days,
  mapDate,
  onMapDate,
  dry,
}: {
  weather: WhereWeather | undefined;
  loading: boolean;
  /** The dates are past the forecast. */
  past: boolean;
  today: string;
  /** Days of the trip. */
  days: number;
  /** The day shown on the map. */
  mapDate: string | undefined;
  onMapDate: (date: string) => void;
  /** Stations in reach that are dry on every day, and all of them. */
  dry: { count: number; total: number } | undefined;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const id = useId();
  const title = t("weather.title");

  if (past) {
    return (
      <PanelSection icon="weather" title={title}>
        <p className="text-sm text-text-muted">{t("weather.past")}</p>
      </PanelSection>
    );
  }
  if (loading) {
    return (
      <PanelSection icon="weather" title={title}>
        <p className="text-sm text-text-muted" role="status">
          {t("weather.loading")}
        </p>
      </PanelSection>
    );
  }
  if (!weather?.days.length) {
    return (
      <PanelSection icon="weather" title={title}>
        <p className="text-sm text-text-muted">{t("weather.unavailable")}</p>
      </PanelSection>
    );
  }

  const label = (date: string) => format.date(localTimeToDate(date));
  const rough = mapDate && daysOut(today, mapDate) > ROUGH_AFTER_DAYS;
  const missing = days - weather.days.length;
  return (
    <PanelSection
      icon="weather"
      title={title}
      summary={dry && t("weather.dry", dry)}
    >
      <FormField label={t("weather.mapDay")} htmlFor={`${id}-day`}>
        <Select
          id={`${id}-day`}
          value={mapDate ?? ""}
          onValueChange={onMapDate}
          options={weather.days.map((d) => ({
            value: d.date,
            label: label(d.date),
          }))}
        />
      </FormField>
      <p className="text-xs text-text-muted">{t("weather.legend")}</p>
      {rough && <p className="text-xs text-text-muted">{t("weather.rough")}</p>}
      {missing > 0 && (
        <p className="text-xs text-text-muted">
          {t("weather.partial", { count: missing })}
        </p>
      )}
    </PanelSection>
  );
}
