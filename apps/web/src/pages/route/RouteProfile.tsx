import type { Leg, RouteNetwork, Stats } from "@wayline/domain";
import {
  cn,
  ElevationProfile,
  type ProfilePoint,
  SurfaceLegend,
  useFormat,
} from "@wayline/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { profilePoints } from "../tripEditor/surfaceProfile";

/** Elevation of the route by surface, under the map. */
export function RouteProfile({
  legs,
  stats,
  network,
  hoverKm,
  onHoverKm,
}: {
  /** Empty until there is a route. */
  legs?: Leg[];
  stats?: Stats;
  network?: RouteNetwork;
  hoverKm?: number;
  onHoverKm: (km: number | undefined) => void;
}) {
  const { t } = useTranslation("route");
  const format = useFormat();
  const points = useMemo(
    () => (legs ? profilePoints(legs, network) : []),
    [legs, network],
  );
  const highest = points.reduce<ProfilePoint | undefined>(
    (best, p) => (!best || p.ele > best.ele ? p : best),
    undefined,
  );
  const hovered =
    hoverKm === undefined
      ? undefined
      : (points.find((p) => p.km >= hoverKm) ?? points.at(-1));

  const readout =
    hovered && hoverKm !== undefined
      ? t("profileChart.at", {
          distance: format.distance(hoverKm * 1000),
          elevation: format.elevation(hovered.ele),
        })
      : stats
        ? t("profileChart.totals", {
            distance: format.distance(stats.distance),
            ascent: format.elevation(stats.ascent),
          })
        : t("profileChart.empty");

  return (
    // Without a route, only wide screens keep the space, so the map does not
    // jump when the route arrives.
    <section
      className={cn(
        "flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-4 py-3",
        !legs && "max-lg:hidden",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="font-bold">{t("profileChart.title")}</h2>
          <span className="text-xs whitespace-nowrap text-text-muted tabular-nums">
            {readout}
          </span>
        </div>
        <SurfaceLegend />
      </div>
      <ElevationProfile
        points={points}
        hoverKm={hoverKm}
        onHoverKm={onHoverKm}
        aria-label={t("profileChart.label", {
          elevation: format.elevation(highest?.ele ?? 0),
          distance: format.distance((highest?.km ?? 0) * 1000),
        })}
      />
    </section>
  );
}
