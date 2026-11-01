import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import {
  addDays,
  dayShares,
  type GenerateRequest,
  localTimeToDate,
  type Place,
  type Profile,
  type TripKind,
} from "@wayline/domain";
import {
  Button,
  Chip,
  DateField,
  DayStrip,
  FormField,
  NumberInput,
  RadioCards,
  SegmentedControl,
  Select,
  Switch,
  useFormat,
} from "@wayline/ui";
import {
  ArrowRight,
  Castle,
  Grape,
  type LucideIcon,
  Shuffle,
  Trees,
  Waves,
} from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  backByTimes,
  defaultValues,
  detour,
  formDays,
  fromRequest,
  isFormError,
  lengths,
  newTripSchema,
  type NewTripValues,
  shapes,
  startTimes,
  type ThemeChoice,
  themes,
  toRequest,
  type TripLength,
  type TripShape,
} from "./form";
import { NewTripMap } from "./NewTripMap";
import { PlaceField } from "./PlaceField";

const profiles: Profile[] = ["touring", "fast", "scenic", "quiet"];
const budgets = ["low", "mid", "high"] as const;
const themeIcons: Record<ThemeChoice, LucideIcon> = {
  any: Shuffle,
  nature: Trees,
  water: Waves,
  wine: Grape,
  culture: Castle,
};

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NewTripForm({
  places,
  kind,
  request,
}: {
  places: Place[];
  kind?: TripKind;
  request?: GenerateRequest;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const navigate = useNavigate();
  const id = useId();
  const [now] = useState(today);

  const form = useForm({
    defaultValues: request
      ? fromRequest(request, defaultValues(places, now, kind))
      : defaultValues(places, now, kind),
    validators: { onChange: newTripSchema },
    onSubmit: ({ value }) =>
      navigate({ to: "/proposals", search: { request: toRequest(value) } }),
  });

  /** The first error of a field, once the user changed it or submitted. */
  const errorOf = (meta: { isTouched: boolean; errors: unknown[] }) => {
    if (!meta.isTouched && form.state.submissionAttempts === 0) return;
    const first = meta.errors[0] as { message?: unknown } | undefined;
    return isFormError(first?.message)
      ? t(`errors.${first.message}`)
      : undefined;
  };

  return (
    <div className="flex min-h-0 flex-1">
      <form.Subscribe
        selector={(s) =>
          [s.values.shape, s.values.start, s.values.end] as const
        }
      >
        {([shape, start, end]) => (
          <div className="relative hidden min-w-0 flex-1 md:block">
            <NewTripMap start={start} end={shape === "ab" ? end : null} />
          </div>
        )}
      </form.Subscribe>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="flex min-h-0 w-full flex-col bg-surface md:max-w-panel md:border-l md:border-border"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <h1 className="text-xl font-extrabold tracking-tight">
            {t("title")}
          </h1>

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
                      onValueChange={(v) => field.handleChange(v as TripShape)}
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

          <form.Subscribe selector={(s) => s.values.shape}>
            {(shape) => (
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
                            invalid={!!error}
                            describedBy={error && `${id}-end-error`}
                          />
                        </FormField>
                      );
                    }}
                  </form.Field>
                )}
              </div>
            )}
          </form.Subscribe>

          <form.Subscribe selector={(s) => s.values.length}>
            {(length) => (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-bold">
                  {t("when.label")}
                </legend>
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
              </fieldset>
            )}
          </form.Subscribe>

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
                {length === "multi" && (
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
                )}
              </div>
            )}
          </form.Subscribe>
          <form.Subscribe selector={(s) => s.values}>
            {(values) => (
              <DetourHint
                values={values}
                onFit={(km) => form.setFieldValue("kmPerDay", km)}
              />
            )}
          </form.Subscribe>

          <form.Field name="profile">
            {(field) => (
              <FormField
                label={t("profile.label")}
                labelId={`${id}-profile`}
                hint={t(`profile.hint.${field.state.value}`)}
              >
                <SegmentedControl
                  stretch
                  aria-labelledby={`${id}-profile`}
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as Profile)}
                  options={profiles.map((p) => ({
                    value: p,
                    label: t(`profile.${p}`),
                  }))}
                />
              </FormField>
            )}
          </form.Field>

          <form.Field name="theme">
            {(field) => (
              <FormField
                label={t("theme.label")}
                labelId={`${id}-theme`}
                hint={t(`theme.hint.${field.state.value}`)}
              >
                <div
                  role="group"
                  aria-labelledby={`${id}-theme`}
                  className="flex flex-wrap gap-2"
                >
                  {themes.map((theme) => {
                    const Icon = themeIcons[theme];
                    return (
                      <Chip
                        key={theme}
                        size="md"
                        selected={field.state.value === theme}
                        onClick={() => field.handleChange(theme)}
                      >
                        <Icon aria-hidden />
                        {t(`theme.${theme}`)}
                      </Chip>
                    );
                  })}
                </div>
              </FormField>
            )}
          </form.Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <form.Subscribe selector={(s) => s.values}>
            {(values) => <Summary values={values} />}
          </form.Subscribe>
          <Button type="submit" variant="primary">
            {t("submit")}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </form>
    </div>
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
}: {
  values: NewTripValues;
  onFit: (kmPerDay: number) => void;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const shares = values.length === "one" ? [1] : sharesOf(values);
  const fit =
    shares &&
    detour(
      values,
      shares.reduce((a, b) => a + b, 0),
    );
  if (!fit) return null;
  return (
    <div className="flex items-center gap-3 rounded-md bg-selected px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        {t("detour.text", {
          from: values.start?.name,
          to: values.end?.name,
          distance: format.distance(fit.km * 1000),
        })}
      </span>
      <Button size="sm" type="button" onClick={() => onFit(fit.kmPerDay)}>
        {t(values.length === "one" ? "detour.fitOne" : "detour.fit", {
          distance: format.distance(fit.kmPerDay * 1000),
        })}
      </Button>
    </div>
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
