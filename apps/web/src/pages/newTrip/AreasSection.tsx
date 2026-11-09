import type { Place } from "@wayline/domain";
import {
  Button,
  MoreRow,
  PanelSection,
  PickList,
  ReachTime,
  useFormat,
} from "@wayline/ui";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AreaReach } from "./areas";
import { type Reach, reachBand } from "./reach";
import type { ReachStation } from "./ReachLayer";

/** Rows before "Show all". */
const FIRST_ROWS = 7;

/** Where step: areas within the max train time, or the stations of one. */
export function AreasSection({
  areas,
  maxHours,
  picked,
  stations,
  onPick,
  onHover,
  onPickStation,
}: {
  /** Areas within the max time, fastest first. Undefined: loading. */
  areas: AreaReach[] | undefined;
  maxHours: number;
  picked: AreaReach | undefined;
  /** Stations of the picked area with a train, fastest first. */
  stations: ReachStation[];
  /** Undefined: back to all areas. */
  onPick: (id: string | undefined) => void;
  onHover: (id: string | undefined) => void;
  onPickStation: (station: Place) => void;
}) {
  const { t } = useTranslation("newTrip");
  if (!areas) {
    return (
      <PanelSection icon="areas" title={t("areas.title")}>
        <p className="text-sm text-text-muted" role="status">
          {t("areas.loading")}
        </p>
      </PanelSection>
    );
  }
  if (picked) {
    return (
      <PanelSection
        icon="areas"
        title={t("areas.title")}
        summary={picked.area.name}
      >
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={() => onPick(undefined)}>
            <ArrowLeft aria-hidden />
            {t("areas.all")}
          </Button>
        </div>
        {stations.length ? (
          <Rows
            label={t("areas.stations", { area: picked.area.name })}
            rows={stations.map((s) => ({
              id: s.place.osmId ?? s.place.name,
              title: s.place.name,
              reach: s.reach,
            }))}
            onPick={(id) => {
              const station = stations.find(
                (s) => (s.place.osmId ?? s.place.name) === id,
              );
              if (station) onPickStation(station.place);
            }}
          />
        ) : (
          <p className="text-sm text-text-muted">{t("areas.noStations")}</p>
        )}
      </PanelSection>
    );
  }
  return (
    <PanelSection
      icon="areas"
      title={t("areas.title")}
      summary={t("areas.inReach", { count: areas.length })}
    >
      {areas.length ? (
        <Rows
          label={t("areas.title")}
          rows={areas.map((a) => ({
            id: a.area.id,
            title: a.area.name,
            ...(a.reach && { reach: a.reach }),
          }))}
          onPick={onPick}
          onHover={onHover}
        />
      ) : (
        <p className="text-sm text-text-muted">
          {t("areas.none", { count: maxHours })}
        </p>
      )}
    </PanelSection>
  );
}

/** A list with train times. The first rows, then "Show all". */
function Rows({
  label,
  rows,
  onPick,
  onHover,
}: {
  label: string;
  rows: { id: string; title: string; reach?: Reach }[];
  onPick: (id: string) => void;
  onHover?: (id: string | undefined) => void;
}) {
  const { t } = useTranslation("newTrip");
  const format = useFormat();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);
  return (
    <PickList
      aria-label={label}
      onPick={onPick}
      {...(onHover && { onHoverChange: onHover })}
      options={shown.map(({ id, title, reach }) => ({
        id,
        title,
        ...(reach && {
          detail: [
            t("reach.changes", { count: reach.changes }),
            ...(reach.reservation ? [t("reach.mark")] : []),
          ].join(" · "),
          end: (
            <ReachTime
              time={format.duration(reach.minutes / 60)}
              band={reachBand(reach.minutes)}
            />
          ),
        }),
      }))}
      footer={
        rows.length > FIRST_ROWS && (
          <MoreRow
            label={
              all ? t("areas.fewer") : t("areas.more", { count: rows.length })
            }
            expanded={all}
            onClick={() => setAll(!all)}
          />
        )
      }
    />
  );
}
