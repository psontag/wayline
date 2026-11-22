import type { Place } from "@wayline/domain";
import {
  Button,
  ChoiceList,
  MoreRow,
  PanelHeader,
  PanelSection,
  RainStrip,
  ReachTime,
  SegmentedControl,
  Select,
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
const kmChoices = [50, 70, 90];

/** The choices, plus the current km when it is another one. */
function kmOptions(current: number | undefined): number[] {
  return current && !kmChoices.includes(current)
    ? [...kmChoices, current].sort((a, b) => a - b)
    : kmChoices;
}

/** Stations in the Start list before "Show all". */
const FIRST_STATIONS = 4;

const ANY = "any";

/** One area of New trip: its weather and trains, the start, then trips. */
export function AreaPanel({
  area,
  stations,
  trip,
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
          title={area.area.name}
          {...(area.reach && { actions: time(area.reach.minutes) })}
          // Facts about the area, not choices: one line and the forecast.
          notice={
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-muted">
                {[
                  ...(area.days
                    ? [t(`area.rain.${area.rain ?? "unknown"}`)]
                    : []),
                  fastest
                    ? t("area.fastest", {
                        station: fastest.place.name,
                        time: format.duration(fastest.reach.minutes / 60),
                      })
                    : t("areas.noStations"),
                  ...(fastest
                    ? [t("area.stationCount", { count: stations.length })]
                    : []),
                ].join(" · ")}
              </p>
              {area.days && (
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
              )}
            </div>
          }
        />

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

        {routes}
      </div>

      {/* The trip choices sit next to the button they change. */}
      <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <SegmentedControl
            aria-label={t("shape.label")}
            value={shape}
            onValueChange={(v) => onShape(v as AreaShape)}
            options={areaShapes.map((s) => ({
              value: s,
              label: t(`area.shape.${s}`),
            }))}
          />
          <div className="min-w-0 flex-1">
            <Select
              aria-label={t("area.kmLabel")}
              value={String(kmPerDay ?? "")}
              onValueChange={(v) => onKmPerDay(Number(v))}
              options={kmOptions(kmPerDay).map((km) => ({
                value: String(km),
                label: t("area.kmPerDay", {
                  distance: format.distance(km * 1000),
                }),
              }))}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onMore}>
            {t("area.more")}
          </Button>
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
    </div>
  );
}
