import { addDays, localTimeToDate } from "@wayline/domain";
import {
  Button,
  DateField,
  FormField,
  PanelHeader,
  PanelSection,
  Select,
  useFormat,
} from "@wayline/ui";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { dayOptions } from "./form";

/** Step 1 of New trip: dates and days. The map picks the start. */
export function WherePanel({
  now,
  startDate,
  days,
  onStartDate,
  onDays,
  onChoosePlace,
  lead,
  children,
}: {
  now: string;
  startDate: string;
  days: number;
  onStartDate: (date: string) => void;
  onDays: (days: number) => void;
  onChoosePlace: () => void;
  /** Sections above the dates, e.g. the areas on phones. */
  lead?: ReactNode;
  /** More sections, e.g. the train reach. */
  children?: ReactNode;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const id = useId();
  const first = format.date(localTimeToDate(startDate));
  const last = format.date(localTimeToDate(addDays(startDate, days - 1)));

  return (
    <div className="flex min-h-0 w-full flex-col border-border bg-surface max-md:flex-1 max-md:border-t md:max-w-panel md:border-l">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PanelHeader eyebrow={t("step.where")} title={t("where.title")} />
        {lead}

        <PanelSection
          icon="dates"
          title={t("where.dates")}
          summary={days === 1 ? first : t("where.range", { first, last })}
        >
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
        </PanelSection>

        {children}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-4">
        <span className="text-xs text-text-muted">{t("where.hint")}</span>
        <Button type="button" onClick={onChoosePlace}>
          {t("where.choosePlace")}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
