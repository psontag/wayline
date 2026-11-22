import {
  MoreRow,
  PanelSection,
  PickList,
  type PickOption,
  RainDot,
  ReachTime,
  useFormat,
} from "@wayline/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AreaReach } from "./areas";
import { type Reach, reachBand } from "./reach";

/** Rows before "Show all". */
const FIRST_ROWS = 7;

/** Where step: areas within the max train time. A click opens one. */
export function AreasSection({
  areas,
  maxHours,
  onPick,
  onHover,
}: {
  /** Areas within the max time, dry first, then fastest. Undefined: loading. */
  areas: AreaReach[] | undefined;
  maxHours: number;
  onPick: (id: string) => void;
  onHover: (id: string | undefined) => void;
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
  const withRain = areas.filter((a) => a.rain);
  return (
    <PanelSection
      icon="areas"
      title={t("areas.title")}
      summary={
        withRain.length
          ? t("areas.dry", {
              count: withRain.filter((a) => a.rain === "dry").length,
              total: withRain.length,
            })
          : t("areas.inReach", { count: areas.length })
      }
    >
      {areas.length ? (
        <Rows
          label={t("areas.title")}
          rows={areas.map((a) => ({
            id: a.area.id,
            title: a.area.name,
            ...(a.reach && { reach: a.reach }),
            // One line per area. The 16 days are on the area itself.
            ...(a.days && {
              start: <RainDot rain={a.rain} />,
              muted: a.rain === "wet",
            }),
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
  rows: ({ id: string; title: string; reach?: Reach } & Pick<
    PickOption,
    "start" | "below" | "muted"
  >)[];
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
      options={shown.map(({ id, title, reach, ...rest }) => ({
        id,
        title,
        ...rest,
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
