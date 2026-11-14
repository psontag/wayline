import { addDays, localTimeToDate } from "@wayline/domain";
import {
  Chip,
  PanelSection,
  ReachTime,
  useFormat,
  WindowCard,
} from "@wayline/ui";
import { useTranslation } from "react-i18next";
import { reachBand } from "./reach";
import type { TripWindow } from "./tripWindows";

/** Areas named in each suggestion. */
const SHOWN_AREAS = 3;

/** Where step: the best trip windows for the trip length, with dry areas. */
export function SuggestionsSection({
  now,
  windows,
  days,
  startDate,
  onWindow,
  onArea,
}: {
  now: string;
  windows: TripWindow[];
  days: number;
  startDate: string;
  /** Sets the dates to the window. */
  onWindow: (startDate: string) => void;
  /** Sets the dates and opens the area. */
  onArea: (startDate: string, areaId: string) => void;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const label = (start: string) =>
    format.dateRange(
      localTimeToDate(start),
      localTimeToDate(addDays(start, days - 1)),
    );

  return (
    <PanelSection
      icon="suggestions"
      title={t("suggest.title")}
      summary={t("suggest.summary", {
        days: t("where.dayCount", { count: days }),
      })}
    >
      {windows.length ? (
        <div className="flex flex-col gap-1.5">
          {windows.map((w) => {
            const start = addDays(now, w.start);
            return (
              <WindowCard
                key={w.start}
                title={label(start)}
                detail={t("suggest.dry", { count: w.dry.length })}
                selected={start === startDate}
                onPick={() => onWindow(start)}
                {...(w.rough && { note: t("suggest.rough") })}
              >
                <div className="flex flex-wrap gap-1.5">
                  {w.dry.slice(0, SHOWN_AREAS).map((a) => (
                    <Chip
                      key={a.area.id}
                      onClick={() => onArea(start, a.area.id)}
                    >
                      {a.area.name}
                      {a.reach && (
                        <ReachTime
                          time={format.duration(a.reach.minutes / 60)}
                          band={reachBand(a.reach.minutes)}
                        />
                      )}
                    </Chip>
                  ))}
                </div>
              </WindowCard>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted">{t("suggest.none")}</p>
      )}
    </PanelSection>
  );
}
