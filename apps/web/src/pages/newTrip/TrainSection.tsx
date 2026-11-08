import {
  FormField,
  PanelSection,
  ReachLegend,
  SegmentedControl,
  Switch,
} from "@wayline/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_HOME_STATION, sameStation } from "../../data/homeStation";
import { type ReachFilter, reachChanges, reachHours } from "./reach";

/** Where step: train time from home, and its filters. */
export function TrainSection({
  home,
  available,
  filter,
  onFilter,
}: {
  home: string;
  /** False: no train times for this home station. */
  available: boolean;
  filter: ReachFilter;
  onFilter: (filter: ReachFilter) => void;
}) {
  const { t } = useTranslation("newTrip");
  const id = useId();
  const set = (patch: Partial<ReachFilter>) =>
    onFilter({ ...filter, ...patch });
  const summary = [
    t("reach.upTo", { count: filter.maxHours }),
    t("reach.maxChanges", { count: filter.maxChanges }),
    ...(filter.fast ? [t("reach.fastShort")] : []),
  ].join(" · ");

  if (!available) {
    return (
      <PanelSection icon="trains" title={t("reach.title")}>
        <p className="text-sm text-text-muted">
          {sameStation(home, DEFAULT_HOME_STATION)
            ? t("reach.noData")
            : t("reach.unavailable", { home, station: DEFAULT_HOME_STATION })}
        </p>
      </PanelSection>
    );
  }
  return (
    <PanelSection icon="trains" title={t("reach.title")} summary={summary}>
      <FormField label={t("reach.maxTime")} labelId={`${id}-time`}>
        <SegmentedControl
          stretch
          aria-labelledby={`${id}-time`}
          value={String(filter.maxHours)}
          onValueChange={(v) =>
            set({ maxHours: Number(v) as ReachFilter["maxHours"] })
          }
          options={reachHours.map((h) => ({
            value: String(h),
            label: t("reach.upTo", { count: h }),
          }))}
        />
      </FormField>
      <FormField label={t("reach.changesLabel")} labelId={`${id}-changes`}>
        <SegmentedControl
          stretch
          aria-labelledby={`${id}-changes`}
          value={String(filter.maxChanges)}
          onValueChange={(v) =>
            set({ maxChanges: Number(v) as ReachFilter["maxChanges"] })
          }
          options={reachChanges.map((c) => ({
            value: String(c),
            label: t("reach.maxChanges", { count: c }),
          }))}
        />
      </FormField>
      <Switch
        checked={filter.fast}
        onCheckedChange={(fast) => set({ fast })}
        label={t("reach.fast")}
        hint={t("reach.fastHint")}
      />
      <ReachLegend
        bands={reachHours.map((h) => ({
          band: h,
          label: t("reach.upTo", { count: h }),
        }))}
        reservation={{
          mark: t("reach.mark"),
          name: t("reach.reservation"),
          label: t("reach.reservationHint"),
        }}
      />
    </PanelSection>
  );
}
