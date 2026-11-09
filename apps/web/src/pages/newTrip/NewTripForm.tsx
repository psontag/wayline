import { useForm, useStore } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import {
  addDays,
  dayShares,
  type GenerateRequest,
  localTimeToDate,
  type LonLat,
  type Place,
  type TripKind,
} from "@wayline/domain";
import {
  Button,
  cn,
  DateField,
  DayStrip,
  FormField,
  NumberInput,
  PanelHeader,
  PanelSection,
  RadioCards,
  SegmentedControl,
  Select,
  Suggestion,
  Switch,
  useFormat,
} from "@wayline/ui";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  backByTimes,
  defaultValues,
  detour,
  endRequired,
  formDays,
  fromRequest,
  mapPick,
  startPick,
  isFormError,
  lengths,
  missingPlaces,
  newTripSchema,
  type NewTripValues,
  shapes,
  startTimes,
  toRequest,
  type TripLength,
  type TripShape,
  withDays,
} from "./form";
import { NewTripMap } from "./NewTripMap";
import { PlaceField } from "./PlaceField";
import { defaultReachFilter } from "./reach";
import type { ReachStation } from "./ReachLayer";
import { RouteSection } from "./RouteSection";
import type { ShelfRoute } from "./routeShelf";
import { TrainSection } from "./TrainSection";
import { useReach } from "./useReach";
import { useRouteShelf } from "./useRouteShelf";
import type { NewTripStep } from "./search";
import { WherePanel } from "./WherePanel";
import { nearestPlace } from "./places";
import { usePrepare } from "./usePrepare";

const budgets = ["low", "mid", "high"] as const;

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NewTripForm({
  places,
  kind,
  request,
  step,
}: {
  places: Place[];
  kind?: TripKind;
  request?: GenerateRequest;
  step: NewTripStep;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const navigate = useNavigate();
  const id = useId();
  const [now] = useState(today);

  const form = useForm({
    defaultValues: request
      ? fromRequest(request, defaultValues(now, kind))
      : defaultValues(now, kind),
    validators: { onChange: newTripSchema },
    onSubmit: ({ value }) =>
      navigate({ to: "/proposals", search: { request: toRequest(value) } }),
  });
  const values = useStore(form.store, (s) => s.values);
  usePrepare(values);
  const where = step === "where";
  const goTo = (next: NewTripStep) =>
    navigate({ to: "/new", search: (prev) => ({ ...prev, step: next }) });
  const toTrip = () => void goTo("trip");
  const toWhere = () => void goTo("where");
  const [reachFilter, setReachFilter] = useState(defaultReachFilter);
  const reach = useReach(places, values.startDate, reachFilter);
  const shelf = useRouteShelf(places, reach.file, reachFilter, values);
  const [selectedRoute, setSelectedRoute] = useState(request?.route);
  const [hoveredRoute, setHoveredRoute] = useState<string>();
  const shownRoute = shelf?.find(
    (r) => r.name === (hoveredRoute ?? selectedRoute),
  );
  const stretch = shelf?.find((r) => r.name === selectedRoute)?.stretch;
  const mapStations = useMemo(
    () =>
      reach.stations && shownRoute
        ? fadeOffRoute(reach.stations, shownRoute)
        : reach.stations,
    [reach.stations, shownRoute],
  );
  const pickStation = (station: Place) => {
    form.setFieldValue("start", station);
    toTrip();
  };
  const ride = (route: ShelfRoute) => {
    const s = route.stretch;
    if (!s) return;
    const next = {
      ...form.state.values,
      shape: "ab" as const,
      start: s.from.place,
      end: s.to.place,
    };
    void navigate({
      to: "/proposals",
      search: { request: { ...toRequest(next), route: route.name } },
    });
  };
  const setDays = (days: number) => {
    const next = withDays(form.state.values, days);
    form.setFieldValue("length", next.length);
    form.setFieldValue("shape", next.shape);
    form.setFieldValue("endDate", next.endDate);
  };

  /** The first error of a field, once the user changed it or submitted. */
  const errorOf = (meta: { isTouched: boolean; errors: unknown[] }) => {
    if (!meta.isTouched && form.state.submissionAttempts === 0) return;
    const first = meta.errors[0] as { message?: unknown } | undefined;
    return isFormError(first?.message)
      ? t(`errors.${first.message}`)
      : undefined;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <form.Subscribe
        selector={(s) =>
          [s.values.shape, s.values.start, s.values.end] as const
        }
      >
        {([shape, start, end]) => {
          // Where: a click picks the start and moves on to the Trip step.
          const next = where ? startPick : mapPick({ shape, start, end });
          const pick = (at: LonLat, nearKm: number) => {
            const place = nearestPlace(places, at, nearKm);
            if (place) form.setFieldValue(next.field, place);
            if (place && where) toTrip();
            return place;
          };
          return (
            // Phones: on Trip a small map, so the form keeps most of the
            // screen. It shows nothing useful until there is a start.
            <div
              className={cn(
                "relative shrink-0 md:h-auto md:min-w-0 md:flex-1",
                where ? "h-1/2" : "h-1/4",
                !where && !start && "max-md:hidden",
              )}
            >
              <NewTripMap
                start={where ? (stretch?.from.place ?? null) : start}
                end={
                  where
                    ? (stretch?.to.place ?? null)
                    : shape === "ab"
                      ? end
                      : null
                }
                {...(next.open && { next: next.field })}
                onPick={pick}
                {...(where &&
                  mapStations && {
                    reach: {
                      stations: mapStations,
                      attribution: reach.attribution,
                      fitKey: `${reachFilter.maxHours}`,
                      onPick: pickStation,
                    },
                  })}
                {...(where &&
                  shownRoute && {
                    shelf: {
                      route: shownRoute,
                      selected: shownRoute.name === selectedRoute,
                    },
                  })}
              />
            </div>
          );
        }}
      </form.Subscribe>

      {where && (
        <form.Subscribe
          selector={(s) => [s.values.startDate, formDays(s.values)] as const}
        >
          {([startDate, days]) => (
            <WherePanel
              now={now}
              startDate={startDate}
              days={days}
              onStartDate={(date) => {
                form.setFieldValue("startDate", date);
                form.setFieldValue("endDate", addDays(date, days - 1));
              }}
              onDays={setDays}
              onChoosePlace={toTrip}
            >
              <TrainSection
                home={reach.home}
                available={reach.stations !== null}
                filter={reachFilter}
                onFilter={setReachFilter}
              />
              {reach.stations !== null && (
                <RouteSection
                  routes={shelf}
                  maxHours={reachFilter.maxHours}
                  days={days}
                  kmPerDay={values.kmPerDay}
                  selected={selectedRoute}
                  onSelect={setSelectedRoute}
                  onHover={setHoveredRoute}
                  onRide={ride}
                />
              )}
            </WherePanel>
          )}
        </form.Subscribe>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className={cn(
          "min-h-0 w-full flex-col border-border bg-surface max-md:flex-1 max-md:border-t md:max-w-panel md:border-l",
          where ? "hidden" : "flex",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <PanelHeader
            nav={
              <Button type="button" variant="ghost" size="sm" onClick={toWhere}>
                <ChevronLeft aria-hidden />
                {t("step.back")}
              </Button>
            }
            eyebrow={t("step.trip")}
            title={t("title")}
          />

          <PanelSection icon="trip" title={t("section.trip")}>
            <form.Field name="length">
              {(field) => (
                <FormField label={t("length.label")} labelId={`${id}-length`}>
                  <SegmentedControl
                    stretch
                    aria-labelledby={`${id}-length`}
                    value={field.state.value}
                    onValueChange={(v) => {
                      field.handleChange(v as TripLength);
                      // An open ride is one day only.
                      if (v === "multi" && form.state.values.shape === "open") {
                        form.setFieldValue("shape", "ab");
                      }
                    }}
                    options={lengths.map((l) => ({
                      value: l,
                      label: t(`length.${l}`),
                    }))}
                  />
                </FormField>
              )}
            </form.Field>

            <form.Subscribe selector={(s) => s.values.length}>
              {(length) => (
                <form.Field name="shape">
                  {(field) => (
                    <FormField label={t("shape.label")} labelId={`${id}-shape`}>
                      <RadioCards
                        aria-labelledby={`${id}-shape`}
                        value={field.state.value}
                        onValueChange={(v) =>
                          field.handleChange(v as TripShape)
                        }
                        options={shapes
                          .filter((k) => k !== "open" || length === "one")
                          .map((k) => ({
                            value: k,
                            label: t(`shape.${k}.label`),
                            hint: t(`shape.${k}.hint`),
                          }))}
                      />
                    </FormField>
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </PanelSection>

          <form.Subscribe
            selector={(s) => [s.values.shape, s.values.length] as const}
          >
            {([shape, length]) => (
              <PanelSection
                icon="stop"
                title={t(shape === "ab" ? "section.places" : "section.place")}
              >
                <div className="grid grid-cols-2 gap-3">
                  <form.Field name="start">
                    {(field) => {
                      const error = errorOf(field.state.meta);
                      return (
                        <FormField
                          label={t("start")}
                          htmlFor={`${id}-start`}
                          error={error}
                          errorId={`${id}-start-error`}
                          className={shape === "ab" ? "" : "col-span-2"}
                        >
                          <PlaceField
                            id={`${id}-start`}
                            places={places}
                            value={field.state.value}
                            onChange={field.handleChange}
                            invalid={!!error}
                            describedBy={error && `${id}-start-error`}
                          />
                        </FormField>
                      );
                    }}
                  </form.Field>
                  {shape === "ab" && (
                    <form.Field name="end">
                      {(field) => {
                        const error = errorOf(field.state.meta);
                        return (
                          <FormField
                            label={t("end")}
                            htmlFor={`${id}-end`}
                            error={error}
                            errorId={`${id}-end-error`}
                          >
                            <PlaceField
                              id={`${id}-end`}
                              places={places}
                              value={field.state.value}
                              onChange={field.handleChange}
                              optional={!endRequired({ shape, length })}
                              invalid={!!error}
                              describedBy={error && `${id}-end-error`}
                            />
                          </FormField>
                        );
                      }}
                    </form.Field>
                  )}
                </div>
              </PanelSection>
            )}
          </form.Subscribe>

          <form.Subscribe selector={(s) => s.values.length}>
            {(length) => (
              <PanelSection icon="dates" title={t("when.label")}>
                <div className="grid grid-cols-2 gap-3">
                  <form.Field name="startDate">
                    {(field) => (
                      <FormField
                        label={t(
                          length === "one" ? "when.date" : "when.firstDay",
                        )}
                        htmlFor={`${id}-date`}
                      >
                        <DateField
                          id={`${id}-date`}
                          min={now}
                          value={field.state.value}
                          onValueChange={(date) => {
                            if (!date) return;
                            // Moving the first day keeps the number of days.
                            const days = formDays(form.state.values);
                            field.handleChange(date);
                            form.setFieldValue(
                              "endDate",
                              addDays(date, days - 1),
                            );
                          }}
                        />
                      </FormField>
                    )}
                  </form.Field>
                  <form.Field name="startTime">
                    {(field) => (
                      <FormField
                        label={t("when.startAt")}
                        htmlFor={`${id}-time`}
                      >
                        <Select
                          id={`${id}-time`}
                          value={field.state.value}
                          onValueChange={field.handleChange}
                          options={startTimes.map((time) => ({
                            value: time,
                            label: format.time(new Date(`2000-01-01T${time}`)),
                          }))}
                        />
                      </FormField>
                    )}
                  </form.Field>
                  {length === "multi" && (
                    <form.Field name="endDate">
                      {(field) => {
                        const error = errorOf(field.state.meta);
                        return (
                          <FormField
                            label={t("when.lastDay")}
                            htmlFor={`${id}-end-date`}
                            error={error}
                            errorId={`${id}-end-date-error`}
                          >
                            <DateField
                              id={`${id}-end-date`}
                              min={addDays(form.state.values.startDate, 1)}
                              value={field.state.value}
                              onValueChange={(date) =>
                                date && field.handleChange(date)
                              }
                            />
                          </FormField>
                        );
                      }}
                    </form.Field>
                  )}
                  {length === "multi" && (
                    <form.Field name="backBy">
                      {(field) => (
                        <FormField
                          label={t("when.backBy")}
                          htmlFor={`${id}-back`}
                        >
                          <Select
                            id={`${id}-back`}
                            value={field.state.value}
                            onValueChange={field.handleChange}
                            options={backByTimes.map((time) => ({
                              value: time,
                              label: format.time(
                                new Date(`2000-01-01T${time}`),
                              ),
                            }))}
                          />
                        </FormField>
                      )}
                    </form.Field>
                  )}
                </div>
                {length === "multi" && (
                  <form.Subscribe selector={(s) => s.values}>
                    {(values) => <Days values={values} />}
                  </form.Subscribe>
                )}
              </PanelSection>
            )}
          </form.Subscribe>

          <PanelSection icon="ride" title={t("section.ride")}>
            <form.Subscribe
              selector={(s) =>
                s.values.length === "one" && s.values.shape !== "ab"
              }
            >
              {(dayTrip) =>
                dayTrip && (
                  <form.Field name="withWind">
                    {(field) => (
                      <Switch
                        checked={field.state.value}
                        onCheckedChange={field.handleChange}
                        label={t("wind.label")}
                        hint={t("wind.hint")}
                      />
                    )}
                  </form.Field>
                )
              }
            </form.Subscribe>

            <form.Subscribe selector={(s) => s.values.length}>
              {(length) => (
                <div className="grid grid-cols-2 gap-3">
                  <form.Field name="kmPerDay">
                    {(field) => {
                      const error = errorOf(field.state.meta);
                      return (
                        <FormField
                          label={t(length === "one" ? "distance" : "kmPerDay")}
                          icon="distance"
                          htmlFor={`${id}-km`}
                          error={error}
                          errorId={`${id}-km-error`}
                        >
                          <NumberInput
                            id={`${id}-km`}
                            unit={t("unit.km")}
                            value={field.state.value}
                            onValueChange={field.handleChange}
                            onBlur={field.handleBlur}
                            aria-invalid={!!error}
                            aria-describedby={error && `${id}-km-error`}
                          />
                        </FormField>
                      );
                    }}
                  </form.Field>
                  <form.Field name="maxAscentPerDay">
                    {(field) => {
                      const error = errorOf(field.state.meta);
                      return (
                        <FormField
                          label={t(
                            length === "one" ? "maxAscent" : "maxAscentPerDay",
                          )}
                          icon="ascent"
                          htmlFor={`${id}-ascent`}
                          error={error}
                          errorId={`${id}-ascent-error`}
                        >
                          <NumberInput
                            id={`${id}-ascent`}
                            unit={t("unit.m")}
                            value={field.state.value}
                            onValueChange={field.handleChange}
                            onBlur={field.handleBlur}
                            aria-invalid={!!error}
                            aria-describedby={error && `${id}-ascent-error`}
                          />
                        </FormField>
                      );
                    }}
                  </form.Field>
                </div>
              )}
            </form.Subscribe>
            <form.Subscribe selector={(s) => s.values}>
              {(values) => (
                <DetourHint
                  values={values}
                  onFit={(km) => form.setFieldValue("kmPerDay", km)}
                  onDays={setDays}
                />
              )}
            </form.Subscribe>
          </PanelSection>

          <form.Subscribe selector={(s) => s.values.length}>
            {(length) =>
              length === "multi" && (
                <PanelSection icon="hotel" title={t("section.hotel")}>
                  <form.Field name="hotelBudget">
                    {(field) => (
                      <FormField
                        label={t("hotelBudget")}
                        icon="budget"
                        htmlFor={`${id}-budget`}
                      >
                        <Select
                          id={`${id}-budget`}
                          value={field.state.value}
                          onValueChange={(v) =>
                            field.handleChange(v as (typeof budgets)[number])
                          }
                          options={budgets.map((b) => ({
                            value: b,
                            label: t(`budget.${b}`),
                          }))}
                        />
                      </FormField>
                    )}
                  </form.Field>
                </PanelSection>
              )
            }
          </form.Subscribe>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-4">
          <form.Subscribe selector={(s) => s.values}>
            {(values) => {
              const missing = missingPlaces(values);
              return (
                <>
                  {missing ? (
                    <span
                      id={`${id}-missing`}
                      className="text-xs text-text-muted"
                    >
                      {t(`missing.${missing}`)}
                    </span>
                  ) : (
                    <Summary values={values} />
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!!missing}
                    aria-describedby={missing && `${id}-missing`}
                  >
                    {t("submit")}
                    <ArrowRight aria-hidden />
                  </Button>
                </>
              );
            }}
          </form.Subscribe>
        </div>
      </form>
    </div>
  );
}

/** Stations off the route fade, so its stations stand out. */
function fadeOffRoute(
  stations: ReachStation[],
  route: ShelfRoute,
): ReachStation[] {
  const on = new Set(route.parts.flatMap((p) => p.stations.map(([id]) => id)));
  return stations.map((s) =>
    s.place.osmId && on.has(s.place.osmId) ? s : { ...s, over: true },
  );
}

/** Shares of a full day, if the dates and times are valid. */
function sharesOf(values: NewTripValues): number[] | undefined {
  const days = formDays(values);
  if (!(days >= 2 && days <= 14)) return undefined;
  return dayShares(days, values.startTime, values.backBy);
}

/** One tile per day: date, target km and why a day is short. */
function Days({ values }: { values: NewTripValues }) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const shares = sharesOf(values);
  if (!shares) return null;
  const time = (hm: string) => format.time(new Date(`2000-01-01T${hm}`));
  const last = shares.length - 1;
  return (
    <div className="flex flex-col gap-1.5">
      <DayStrip
        aria-label={t("when.days")}
        items={shares.map((share, i) => ({
          label: format.date(localTimeToDate(addDays(values.startDate, i))),
          share,
          value: t("when.dayKm", {
            distance: format.distance(
              Math.round(((values.kmPerDay ?? 0) * share) / 5) * 5000,
            ),
          }),
          note:
            i === 0 && share < 1
              ? t("when.from", { time: time(values.startTime) })
              : i === last && share < 1
                ? t("when.backByDay", { time: time(values.backBy) })
                : t("when.fullDay"),
        }))}
      />
      <span className="text-xs text-text-muted">{t("when.hint")}</span>
    </div>
  );
}

/** Says when the planned km are much longer than the way from A to B. */
function DetourHint({
  values,
  onFit,
  onDays,
}: {
  values: NewTripValues;
  onFit: (kmPerDay: number) => void;
  onDays: (days: number) => void;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const shares = values.length === "one" ? [1] : sharesOf(values);
  const days = shares?.reduce((a, b) => a + b, 0);
  const fit = days && detour(values, days);
  if (!fit || !days || !values.kmPerDay) return null;
  const { days: fewer, kmPerDay } = fit;
  return (
    <Suggestion
      text={t("detour.text", {
        from: values.start?.name,
        to: values.end?.name,
        distance: format.distance(fit.km * 1000),
        total: format.distance(days * values.kmPerDay * 1000),
      })}
    >
      {fewer && (
        <Button size="sm" type="button" onClick={() => onDays(fewer)}>
          {t("detour.days", { count: fewer })}
        </Button>
      )}
      {kmPerDay && (
        <Button size="sm" type="button" onClick={() => onFit(kmPerDay)}>
          {t(values.length === "one" ? "detour.fitOne" : "detour.fit", {
            distance: format.distance(kmPerDay * 1000),
          })}
        </Button>
      )}
    </Suggestion>
  );
}

function Summary({ values }: { values: NewTripValues }) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const km = values.kmPerDay;
  const shares = values.length === "one" ? [1] : sharesOf(values);
  if (!km || !shares) return <span />;
  const days = shares.reduce((a, b) => a + b, 0);
  return (
    <span className="text-xs text-text-muted tabular-nums">
      {t("summary", {
        count: shares.length,
        distance: format.distance(days * km * 1000),
      })}
    </span>
  );
}
