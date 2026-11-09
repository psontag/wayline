import {
  Button,
  ChoiceList,
  MoreRow,
  PanelSection,
  Stat,
  useFormat,
} from "@wayline/ui";
import { localTimeToDate } from "@wayline/domain";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ShelfRoute, ShelfStop } from "./routeShelf";
import type { LineWind } from "./whereWeather";

/** Rows before "Show all". */
const FIRST_ROWS = 6;

/** "Sat and Sun". */
function dateList(format: ReturnType<typeof useFormat>, dates: string[]) {
  return format.list(dates.map((d) => format.weekday(localTimeToDate(d))));
}

/** Where step: signed routes with stations in reach, and the stretch to ride. */
export function RouteSection({
  routes,
  maxHours,
  days,
  kmPerDay,
  selected,
  onSelect,
  onHover,
  onRide,
  rain,
  wind,
}: {
  /** Null: no route or train data. Undefined: loading. */
  routes: ShelfRoute[] | null | undefined;
  /** Wet days on a route's stretch. Missing without a forecast. */
  rain?: (route: ShelfRoute) => string[];
  /** Wind on a route's stretch. Missing without a forecast. */
  wind?: (route: ShelfRoute) => LineWind | undefined;
  maxHours: number;
  days: number;
  kmPerDay: number | undefined;
  selected: string | undefined;
  onSelect: (name: string) => void;
  onHover: (name: string | undefined) => void;
  onRide: (route: ShelfRoute) => void;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const [all, setAll] = useState(false);

  if (routes === null) {
    return (
      <PanelSection icon="routes" title={t("shelf.title")}>
        <p className="text-sm text-text-muted">{t("shelf.noData")}</p>
      </PanelSection>
    );
  }
  if (!routes) {
    return (
      <PanelSection icon="routes" title={t("shelf.title")}>
        <p className="text-sm text-text-muted" role="status">
          {t("shelf.loading")}
        </p>
      </PanelSection>
    );
  }

  const current = routes.find((r) => r.name === selected);
  const index = current ? routes.indexOf(current) : -1;
  // The selected route stays in view when the list is short.
  const shown =
    all || index < FIRST_ROWS
      ? routes.slice(0, all ? undefined : FIRST_ROWS)
      : [...routes.slice(0, FIRST_ROWS - 1), routes[index] as ShelfRoute];

  return (
    <PanelSection
      icon="routes"
      title={t("shelf.title")}
      summary={current?.name ?? t("shelf.inReach", { count: routes.length })}
    >
      {routes.length === 0 ? (
        <p className="text-sm text-text-muted">
          {t("shelf.none", { count: maxHours })}
        </p>
      ) : (
        <ChoiceList
          aria-label={t("shelf.title")}
          value={selected}
          onValueChange={onSelect}
          onHoverChange={onHover}
          options={shown.map((r) => {
            const wet = rain?.(r) ?? [];
            return {
              id: r.name,
              title: r.name,
              muted: wet.length > 0,
              detail: [
                ...(wet.length
                  ? [t("shelf.rainOn", { days: dateList(format, wet) })]
                  : []),
                format.distance(r.lengthKm * 1000),
                ...r.tags.map((tag) => t(`shelf.tag.${tag}`)),
                t("shelf.stations", { count: r.stations, hours: maxHours }),
              ].join(" · "),
            };
          })}
          footer={
            routes.length > FIRST_ROWS && (
              <MoreRow
                label={
                  all
                    ? t("shelf.fewer")
                    : t("shelf.all", { count: routes.length })
                }
                expanded={all}
                onClick={() => setAll(!all)}
              />
            )
          }
        />
      )}
      {current && (
        <StretchDetail
          route={current}
          days={days}
          kmPerDay={kmPerDay}
          onRide={() => onRide(current)}
          rain={rain?.(current)}
          wind={wind?.(current)}
        />
      )}
    </PanelSection>
  );
}

function StretchDetail({
  route,
  days,
  kmPerDay,
  onRide,
  rain,
  wind,
}: {
  route: ShelfRoute;
  days: number;
  kmPerDay: number | undefined;
  onRide: () => void;
  rain: string[] | undefined;
  wind: LineWind | undefined;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const s = route.stretch;
  const perDay = format.distance((kmPerDay ?? 0) * 1000);
  if (!s) {
    return (
      <p className="text-sm text-text-muted">
        {t("shelf.noStretch", { count: days, distance: perDay })}
      </p>
    );
  }
  const train = (stop: ShelfStop) =>
    [
      format.duration(stop.reach.minutes / 60),
      t("reach.changes", { count: stop.reach.changes }),
      ...(stop.reach.reservation ? [t("reach.mark")] : []),
    ].join(" · ");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold">
          {t("shelf.stretch", { from: s.from.place.name, to: s.to.place.name })}
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <Stat
            size="sm"
            icon="distance"
            label={t("shelf.distance")}
            value={t("shelf.km", {
              distance: format.distance(s.km * 1000),
              perDay,
            })}
          />
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <Stat
            size="sm"
            icon="train"
            label={t("shelf.out")}
            value={t("shelf.outValue", { train: train(s.from) })}
          />
          <Stat
            size="sm"
            icon="train"
            label={t("shelf.back")}
            value={t("shelf.backValue", { train: train(s.to) })}
          />
        </span>
        {rain && wind && (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <Stat
              size="sm"
              icon={rain.length ? "rain" : "dry"}
              label={t("shelf.rain")}
              value={
                rain.length
                  ? t("shelf.rainOn", { days: dateList(format, rain) })
                  : t("shelf.dry")
              }
            />
            <Stat
              size="sm"
              icon="wind"
              label={t("shelf.wind")}
              value={
                wind.kind === "calm"
                  ? t("shelf.windKind.calm")
                  : t("shelf.windValue", {
                      kind: t(`shelf.windKind.${wind.kind}`),
                      speed: format.speed(wind.speed),
                    })
              }
            />
          </span>
        )}
      </div>
      <Button type="button" variant="primary" onClick={onRide}>
        {t("shelf.ride", { count: days, route: route.name })}
        <ArrowRight aria-hidden />
      </Button>
    </div>
  );
}
