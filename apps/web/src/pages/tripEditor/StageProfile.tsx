import {
  addDays,
  type Climb,
  expectedTimeAtKm,
  type Leg,
  localTimeToDate,
  ridingHours,
  type RouteNetwork,
  stageSpeed,
  type Stage,
  stageStartTime,
  type Trip,
} from "@wayline/domain";
import {
  ChartBody,
  ChartInfo,
  ChartPanel,
  ChartToolbar,
  ClimbLegend,
  cn,
  ElevationProfile,
  eleAt,
  MapLegendLine,
  type ProfilePoint,
  useFormat,
} from "@wayline/ui";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { dayBreaks } from "../proposals/proposalView";
import { isChanged } from "./routeEdits";
import { proposedSection } from "./proposedSection";
import { profilePoints } from "./surfaceProfile";

export type StageProfileProps = {
  trip: Trip;
  index: number;
  /** The whole trip instead of the day at index. */
  overview?: boolean;
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
  /** Legs of the day while a via point is placed. Shown instead of the proposed route. */
  previewLegs?: Leg[];
};

/** Elevation of a stage by surface, in a ChartPanel. */
export function StageProfile({
  trip,
  index,
  overview = false,
  network,
  hoverKm,
  onHoverKm,
  plain = false,
  climbs,
  highlightedClimb,
  actions,
  proposedHighlighted: highlightRequested = false,
  onHighlightProposed,
  previewLegs,
}: StageProfileProps) {
  const { t } = useTranslation("tripEditor");
  const format = useFormat();
  const stage = trip.stages[index];
  const legs = useMemo(
    () => (overview ? trip.stages.flatMap((s) => s.legs) : stage?.legs),
    [overview, trip.stages, stage],
  );
  const points = useMemo(
    () => (legs ? profilePoints(legs, network) : []),
    [legs, network],
  );
  const proposed =
    !overview && isChanged(trip, index) ? trip.proposed?.[index] : undefined;
  const section = useMemo(
    () => (legs && proposed ? proposedSection(legs, proposed.legs) : undefined),
    [legs, proposed],
  );
  const previewSection = useMemo(
    () =>
      !overview && legs && previewLegs
        ? proposedSection(legs, previewLegs)
        : undefined,
    [overview, legs, previewLegs],
  );
  if (!stage) return null;
  const proposedHighlighted = highlightRequested && !!section;
  const compare = previewSection ?? section;

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
    // A time needs the day, so the trip overview shows none.
    readout =
      date && !overview
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
    const shown = overview ? trip.stages : [stage];
    const sum = (f: (s: Stage) => number) =>
      shown.reduce((total, s) => total + f(s), 0);
    readout = t("profile.totalsWithRiding", {
      distance: format.distance(sum((s) => s.stats.distance)),
      ascent: format.elevation(sum((s) => s.stats.ascent)),
      duration: format.duration(
        sum((s) => ridingHours(s.stats, trip.settings.avgSpeed)),
      ),
    });
  }

  const highestAt = {
    elevation: format.elevation(highest?.ele ?? 0),
    distance: format.distance((highest?.km ?? 0) * 1000),
  };
  const label = overview
    ? t("profile.tripLabel", highestAt)
    : t("profile.label", { day: index + 1, ...highestAt });
  const last = trip.stages.at(-1) ?? stage;
  const title = overview
    ? t("profile.tripTitle", {
        from: trip.stages[0]?.start.name ?? stage.start.name,
        to: last.end.name,
      })
    : t("profile.title", {
        day: index + 1,
        from: stage.start.name,
        to: stage.end.name,
      });

  return (
    <ChartPanel title={plain ? undefined : title} tabs={actions} plain={plain}>
      <ChartToolbar
        start={<ClimbLegend />}
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
          dayBreaks={overview ? dayBreaks(trip) : undefined}
          compare={compare?.points}
          compareHighlighted={!!previewSection || proposedHighlighted}
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
