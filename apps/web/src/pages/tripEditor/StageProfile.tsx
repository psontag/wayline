import {
  addDays,
  type Climb,
  expectedTimeAtKm,
  localTimeToDate,
  ridingHours,
  type RouteNetwork,
  stageSpeed,
  stageStartTime,
  type Trip,
} from "@wayline/domain";
import {
  ChartBody,
  ChartInfo,
  ChartPanel,
  ChartToolbar,
  cn,
  ElevationProfile,
  eleAt,
  MapLegendLine,
  type ProfilePoint,
  SurfaceLegend,
  useFormat,
} from "@wayline/ui";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { isChanged } from "./routeEdits";
import { proposedSection } from "./proposedSection";
import { profilePoints } from "./surfaceProfile";

export type StageProfileProps = {
  trip: Trip;
  index: number;
  network?: RouteNetwork;
  /** km of the crosshair. */
  hoverKm?: number;
  onHoverKm: (km: number | undefined) => void;
  /** Without the panel frame and title, e.g. in the phone sheet. */
  plain?: boolean;
  /** Climbs of the stage, and the one to show stronger. */
  climbs?: Climb[];
  highlightedClimb?: number;
  /** Controls at the end of the header, e.g. the panel switcher. */
  actions?: ReactNode;
  /** Show the proposed route of a changed day stronger. */
  proposedHighlighted?: boolean;
  onHighlightProposed?: (on: boolean) => void;
};

/** Elevation of a stage by surface, in a ChartPanel. */
export function StageProfile({
  trip,
  index,
  network,
  hoverKm,
  onHoverKm,
  plain = false,
  climbs,
  highlightedClimb,
  actions,
  proposedHighlighted: highlightRequested = false,
  onHighlightProposed,
}: StageProfileProps) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stage = trip.stages[index];
  const legs = stage?.legs;
  const points = useMemo(
    () => (legs ? profilePoints(legs, network) : []),
    [legs, network],
  );
  const proposed = isChanged(trip, index) ? trip.proposed?.[index] : undefined;
  const section = useMemo(
    () => (legs && proposed ? proposedSection(legs, proposed.legs) : undefined),
    [legs, proposed],
  );
  if (!stage) return null;
  const proposedHighlighted = highlightRequested && !!section;

  const date = trip.startDate && addDays(trip.startDate, index);
  const highest = points.reduce<ProfilePoint | undefined>(
    (best, p) => (!best || p.ele > best.ele ? p : best),
    undefined,
  );
  const startTime = stageStartTime(trip.settings, index);
  const hovered =
    hoverKm === undefined
      ? undefined
      : (points.find((p) => p.km >= hoverKm) ?? points.at(-1));

  let readout: string;
  if (hovered && hoverKm !== undefined) {
    const values = {
      distance: format.distance(hoverKm * 1000),
      elevation: format.elevation(hovered.ele),
    };
    readout = date
      ? t("profile.atWithTime", {
          ...values,
          time: format.time(
            localTimeToDate(
              expectedTimeAtKm(
                date,
                startTime,
                stageSpeed(stage.stats, trip.settings.avgSpeed),
                hoverKm,
              ),
            ),
          ),
        })
      : t("profile.at", values);
    const other =
      section && hoverKm >= section.startKm && hoverKm <= section.endKm
        ? eleAt(section.points, hoverKm)
        : undefined;
    if (other !== undefined) {
      readout += ` · ${t("profile.proposedAt", { elevation: format.elevation(other) })}`;
    }
  } else if (proposedHighlighted && proposed) {
    readout = t("profile.proposed", {
      distance: format.distance(proposed.stats.distance),
      ascent: format.elevation(proposed.stats.ascent),
    });
  } else {
    const values = {
      distance: format.distance(stage.stats.distance),
      ascent: format.elevation(stage.stats.ascent),
    };
    readout = t("profile.totalsWithRiding", {
      ...values,
      duration: format.duration(
        ridingHours(stage.stats, trip.settings.avgSpeed),
      ),
    });
  }

  const label = t("profile.label", {
    day: index + 1,
    elevation: format.elevation(highest?.ele ?? 0),
    distance: format.distance((highest?.km ?? 0) * 1000),
  });
  const unknown = points.some((p) => p.surface === "unknown");

  return (
    <ChartPanel
      title={
        plain
          ? undefined
          : t("profile.title", {
              day: index + 1,
              from: stage.start.name,
              to: stage.end.name,
            })
      }
      tabs={actions}
      plain={plain}
    >
      <ChartToolbar
        start={<SurfaceLegend unknown={unknown} />}
        end={
          section && (
            <span
              className={cn(
                "-mx-1 rounded-sm px-1 text-xs text-text-muted",
                proposedHighlighted && "bg-hover text-text",
              )}
              onPointerEnter={() => onHighlightProposed?.(true)}
              onPointerLeave={() => onHighlightProposed?.(false)}
            >
              <MapLegendLine
                item={{ label: t("map.proposed"), line: "proposed" }}
              />
            </span>
          )
        }
      />
      <ChartBody>
        <ElevationProfile
          axes
          tooltip={false}
          className="flex-1"
          climbs={climbs}
          highlightedClimb={highlightedClimb}
          points={points}
          compare={section?.points}
          compareHighlighted={proposedHighlighted}
          hoverKm={hoverKm}
          onHoverKm={onHoverKm}
          aria-label={label}
        />
      </ChartBody>
      <ChartInfo>
        <span className="text-text">{readout}</span>
      </ChartInfo>
    </ChartPanel>
  );
}
