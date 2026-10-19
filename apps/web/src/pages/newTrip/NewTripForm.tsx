import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import type {
  GenerateRequest,
  Place,
  Profile,
  TripKind,
} from "@wayline/domain";
import {
  Button,
  DateField,
  FormField,
  NumberInput,
  NumberStepper,
  RadioCards,
  SegmentedControl,
  Select,
  useFormat,
} from "@wayline/ui";
import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  defaultValues,
  fromRequest,
  isFormError,
  limits,
  newTripSchema,
  startTimes,
  toRequest,
  tripKinds,
  type NewTripKind,
} from "./form";
import { NewTripMap } from "./NewTripMap";
import { PlaceField } from "./PlaceField";

const profiles: Profile[] = ["touring", "fast", "scenic", "quiet"];
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
        selector={(s) => [s.values.kind, s.values.start, s.values.end] as const}
      >
        {([kind, start, end]) => (
          <div className="relative hidden min-w-0 flex-1 md:block">
            <NewTripMap start={start} end={kind === "one-way" ? end : null} />
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

          <form.Field name="kind">
            {(field) => (
              <FormField label={t("kind.legend")} labelId={`${id}-kind`}>
                <RadioCards
                  aria-labelledby={`${id}-kind`}
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as NewTripKind)}
                  options={tripKinds.map((k) => ({
                    value: k,
                    label: t(`kind.${k}.label`),
                    hint: t(`kind.${k}.hint`),
                  }))}
                />
              </FormField>
            )}
          </form.Field>

          <form.Subscribe selector={(s) => s.values.kind}>
            {(kind) => (
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
                        className={kind === "one-way" ? "" : "col-span-2"}
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
                {kind === "one-way" && (
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

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="days">
              {(field) => {
                const error = errorOf(field.state.meta);
                return (
                  <FormField
                    label={t("days")}
                    htmlFor={`${id}-days`}
                    error={error}
                    errorId={`${id}-days-error`}
                  >
                    <NumberStepper
                      id={`${id}-days`}
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      min={limits.days.min}
                      max={limits.days.max}
                      aria-invalid={!!error}
                      aria-describedby={error && `${id}-days-error`}
                    />
                  </FormField>
                );
              }}
            </form.Field>
            <form.Field name="kmPerDay">
              {(field) => {
                const error = errorOf(field.state.meta);
                return (
                  <FormField
                    label={t("kmPerDay")}
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
                    label={t("maxAscentPerDay")}
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
            <form.Field name="hotelBudget">
              {(field) => (
                <FormField label={t("hotelBudget")} htmlFor={`${id}-budget`}>
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
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="startDate">
              {(field) => (
                <FormField
                  label={t("startDate")}
                  note={t("optional")}
                  htmlFor={`${id}-date`}
                >
                  <DateField
                    id={`${id}-date`}
                    clearable
                    min={now}
                    value={field.state.value}
                    onValueChange={field.handleChange}
                  />
                </FormField>
              )}
            </form.Field>
            <form.Field name="startTime">
              {(field) => (
                <FormField label={t("startTime")} htmlFor={`${id}-time`}>
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
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <form.Subscribe
            selector={(s) => [s.values.days, s.values.kmPerDay] as const}
          >
            {([days, km]) => (
              <span className="text-xs text-text-muted tabular-nums">
                {days && km
                  ? t("summary", {
                      count: days,
                      distance: format.distance(days * km * 1000),
                    })
                  : null}
              </span>
            )}
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
