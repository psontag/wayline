import type { Place } from "@wayline/domain";
import {
  Button,
  Chip,
  ChoiceList,
  MoreRow,
  PanelHeader,
  PanelSection,
  RainStrip,
  ReachTime,
  SegmentedControl,
  useFormat,
} from "@wayline/ui";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AreaShape, areaShapes } from "./areaTrips";
import type { AreaReach } from "./areas";
import { reachBand } from "./reach";
import type { ReachStation } from "./ReachLayer";
import { ROUGH_AFTER_DAYS } from "./whereWeather";

/** Km a day to pick from. Others are in "More settings". */
const kmChips = [50, 70, 90];

/** Stations in the Start list before "Show all". */
const FIRST_STATIONS = 4;

const ANY = "any";

/** Step 2 of New trip: one area, its weather, start and trip, then trips. */
export function AreaPanel({
  area,
  stations,
  trip,
  days,
  start,
  onStart,
  shape,
  onShape,
  kmPerDay,
  onKmPerDay,
  onBack,
  onMore,
  onShowTrips,
  routes,
}: {
  area: AreaReach;
  /** Stations of the area with a train, fastest first. */
  stations: ReachStation[];
  /** The trip days as forecast days from today, from and up to. */
  trip: [number, number];
  days: number;
  /** Undefined: any station. */
  start: Place | undefined;
  onStart: (start: Place | undefined) => void;
  shape: AreaShape;
  onShape: (shape: AreaShape) => void;
  kmPerDay: number | undefined;
  onKmPerDay: (km: number) => void;
  onBack: () => void;
  /** Opens the full Trip form. */
  onMore: () => void;
  onShowTrips: () => void;
  /** The signed routes section. */
  routes?: ReactNode;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const [allStations, setAllStations] = useState(false);
  const fastest = stations[0];
  const time = (minutes: number) => (
    <ReachTime time={format.duration(minutes / 60)} band={reachBand(minutes)} />
  );
  const id = (s: ReachStation) => s.place.osmId ?? s.place.name;
  const shown = allStations ? stations : stations.slice(0, FIRST_STATIONS);
  // A picked station further down the list stays visible.
  const picked = start && stations.find((s) => s.place === start);
  const startRows =
    picked && !shown.includes(picked) ? [...shown, picked] : shown;

  return (
    <div className="flex min-h-0 w-full flex-col border-border bg-surface max-md:flex-1 max-md:border-t md:max-w-panel md:border-l">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PanelHeader
          nav={
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft aria-hidden />
              {t("areas.all")}
            </Button>
          }
          eyebrow={t("step.area")}
          title={area.area.name}
          {...(area.reach && { actions: time(area.reach.minutes) })}
        />

        {area.days && (
          <PanelSection
            icon="weather"
            title={t("area.weather")}
            summary={t(`area.rain.${area.rain ?? "unknown"}`)}
          >
            <RainStrip
              size="md"
              aria-label={t("areas.rain", {
                area: area.area.name,
                rain: t(`rain.${area.rain ?? "unknown"}`),
              })}
              days={area.days.map((rain, i) => ({
                ...(rain && { rain }),
                rough: i > ROUGH_AFTER_DAYS,
                selected: i >= trip[0] && i < trip[1],
              }))}
            />
          </PanelSection>
        )}

        <PanelSection
          icon="trains"
          title={t("reach.title")}
          summary={
            fastest &&
            t("area.fastest", {
              station: fastest.place.name,
              time: format.duration(fastest.reach.minutes / 60),
            })
          }
        >
          {fastest ? (
            <p className="text-sm text-text-muted">
              {t("area.stationCount", { count: stations.length })}
            </p>
          ) : (
            <p className="text-sm text-text-muted">{t("areas.noStations")}</p>
          )}
        </PanelSection>

        {stations.length > 0 && (
          <PanelSection
            icon="stop"
            title={t("area.start")}
            summary={start?.name ?? t("area.anyStation")}
          >
            <ChoiceList
              aria-label={t("area.start")}
              value={start ? (picked ? id(picked) : start.name) : ANY}
              onValueChange={(value) =>
                onStart(
                  value === ANY
                    ? undefined
                    : stations.find((s) => id(s) === value)?.place,
                )
              }
              options={[
                {
                  id: ANY,
                  title: t("area.anyStation"),
                  detail: t("area.anyHint"),
                },
                ...startRows.map((s) => ({
                  id: id(s),
                  title: s.place.name,
                  detail: t("reach.changes", { count: s.reach.changes }),
                  end: time(s.reach.minutes),
                })),
              ]}
              footer={
                stations.length > FIRST_STATIONS && (
                  <MoreRow
                    label={
                      allStations
                        ? t("areas.fewer")
                        : t("areas.more", { count: stations.length })
                    }
                    expanded={allStations}
                    onClick={() => setAllStations(!allStations)}
                  />
                )
              }
            />
          </PanelSection>
        )}

        <PanelSection
          icon="trip"
          title={t("section.trip")}
          summary={
            kmPerDay &&
            t("area.kmPerDay", { distance: format.distance(kmPerDay * 1000) })
          }
        >
          <SegmentedControl
            stretch
            aria-label={t("shape.label")}
            value={shape}
            onValueChange={(v) => onShape(v as AreaShape)}
            options={areaShapes.map((s) => ({
              value: s,
              label: t(`area.shape.${s}`),
            }))}
          />
          <div
            role="group"
            aria-label={t("area.kmLabel")}
            className="flex flex-wrap gap-1.5"
          >
            {kmChips.map((km) => (
              <Chip
                key={km}
                selected={kmPerDay === km}
                onClick={() => onKmPerDay(km)}
              >
                {t("area.kmPerDay", { distance: format.distance(km * 1000) })}
              </Chip>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={onMore}
          >
            {t("area.more")}
          </Button>
        </PanelSection>

        {routes}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-4">
        <span className="text-xs text-text-muted">
          {t("area.footer", {
            days: t("where.dayCount", { count: days }),
            shape: t(`area.shapeLower.${shape}`),
          })}
        </span>
        <Button
          type="button"
          variant="primary"
          disabled={!stations.length}
          onClick={onShowTrips}
        >
          {t("area.showTrips")}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
