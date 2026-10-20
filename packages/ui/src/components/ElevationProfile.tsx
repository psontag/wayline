import type { PointerEvent } from "react";
import { cn } from "../lib/cn";

export type SurfaceKind = "paved" | "gravel" | "unpaved";

export type ProfilePoint = {
  km: number;
  /** Meters */
  ele: number;
  /** Surface from this point to the next. */
  surface: SurfaceKind;
};

export type ElevationProfileProps = {
  points: ProfilePoint[];
  /** km of the crosshair. */
  hoverKm?: number;
  onHoverKm?: (km: number | undefined) => void;
  /** A second profile drawn dashed, e.g. the route as proposed. */
  compare?: { km: number; ele: number }[];
  /** Describes the chart for screen readers. */
  "aria-label": string;
  className?: string;
};

const W = 1000;
const H = 100;
// Keep the line off the top and bottom edges.
const PAD = 8;

const stroke: Record<SurfaceKind, string> = {
  paved: "stroke-terrain-paved",
  gravel: "stroke-terrain-gravel",
  unpaved: "stroke-terrain-unpaved",
};

/** Elevation over distance. The line is colored by surface. */
export function ElevationProfile({
  points,
  compare = [],
  hoverKm,
  onHoverKm,
  "aria-label": ariaLabel,
  className,
}: ElevationProfileProps) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return <div className={cn("h-20", className)} />;

  const length = Math.max(last.km, compare.at(-1)?.km ?? 0) - first.km || 1;
  const eles = [...points, ...compare].map((p) => p.ele);
  const min = Math.min(...eles);
  const range = Math.max(...eles) - min || 1;
  const x = (km: number) => ((km - first.km) / length) * W;
  const y = (ele: number) => H - PAD - ((ele - min) / range) * (H - 2 * PAD);
  const xy = (p: { km: number; ele: number }) =>
    `${x(p.km).toFixed(1)} ${y(p.ele).toFixed(1)}`;

  const area = `M${points.map(xy).join(" L")} L${W} ${H} L0 ${H} Z`;

  // One path per run of the same surface. Runs share their end points.
  const runs: { surface: SurfaceKind; d: string }[] = [];
  let current: { surface: SurfaceKind; pts: ProfilePoint[] } | undefined;
  for (const p of points) {
    if (current && current.surface === p.surface) {
      current.pts.push(p);
      continue;
    }
    if (current) {
      current.pts.push(p);
      runs.push({
        surface: current.surface,
        d: `M${current.pts.map(xy).join(" L")}`,
      });
    }
    current = { surface: p.surface, pts: [p] };
  }
  if (current && current.pts.length > 1) {
    runs.push({
      surface: current.surface,
      d: `M${current.pts.map(xy).join(" L")}`,
    });
  }

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    onHoverKm?.(first.km + f * length);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      onPointerMove={onHoverKm && onMove}
      onPointerLeave={onHoverKm && (() => onHoverKm(undefined))}
      className={cn("block h-20 w-full touch-none", className)}
    >
      <path d={area} className="fill-hover" />
      {compare.length > 1 && (
        <path
          d={`M${compare.map(xy).join(" L")}`}
          fill="none"
          strokeWidth={2}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          className="stroke-text-muted"
        />
      )}
      {runs.map((run, i) => (
        <path
          key={i}
          d={run.d}
          fill="none"
          strokeWidth={3}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={stroke[run.surface]}
        />
      ))}
      {hoverKm !== undefined && (
        <line
          x1={x(hoverKm)}
          x2={x(hoverKm)}
          y1={0}
          y2={H}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          className="stroke-text"
        />
      )}
    </svg>
  );
}
