import { type PointerEvent, useState } from "react";
import { useFormat } from "../format";
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
  /**
   * Show height labels in m, km ticks and a readout on hover. Hover works
   * without `onHoverKm`.
   */
  axes?: boolean;
  /** km where a new day starts. Drawn as dashed lines. */
  dayBreaks?: number[];
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

/** Round step that splits `range` into about `count` parts. */
export function niceStep(range: number, count: number): number {
  const raw = range / count;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= raw) ?? 10;
  return step * power;
}

/** Elevation over distance. The line is colored by surface. */
export function ElevationProfile({
  points,
  compare = [],
  hoverKm,
  onHoverKm,
  axes = false,
  dayBreaks = [],
  "aria-label": ariaLabel,
  className,
}: ElevationProfileProps) {
  const format = useFormat();
  const [ownHover, setOwnHover] = useState<number>();
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) {
    return <div className={cn(axes ? "h-24" : "h-20", className)} />;
  }

  const length = Math.max(last.km, compare.at(-1)?.km ?? 0) - first.km || 1;
  const eles = [...points, ...compare].map((p) => p.ele);
  let min = Math.min(...eles);
  let max = Math.max(...eles);
  let pad = PAD;
  const eleStep = niceStep(Math.max(max - min, 40), 3);
  if (axes) {
    min = Math.floor(min / eleStep) * eleStep;
    max = Math.ceil(max / eleStep) * eleStep;
    if (max === min) max = min + eleStep;
    pad = 0;
  }
  const range = max - min || 1;
  const x = (km: number) => ((km - first.km) / length) * W;
  const y = (ele: number) => H - pad - ((ele - min) / range) * (H - 2 * pad);
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

  const setHover = onHoverKm ?? (axes ? setOwnHover : undefined);
  const hover = hoverKm ?? (onHoverKm ? undefined : ownHover);
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover?.(first.km + f * length);
  };

  const eleTicks: number[] = [];
  const kmTicks: number[] = [];
  if (axes) {
    for (let e = min; e <= max; e += eleStep) eleTicks.push(e);
    const kmStep = niceStep(length, 4);
    for (let k = kmStep; k < first.km + length - kmStep / 3; k += kmStep) {
      kmTicks.push(k);
    }
  }

  const chart = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      onPointerMove={setHover && onMove}
      onPointerLeave={setHover && (() => setHover(undefined))}
      className={cn(
        "block w-full touch-none",
        axes ? "h-full" : "h-20",
        !axes && className,
      )}
    >
      {eleTicks.map((e) => (
        <line
          key={e}
          x1={0}
          x2={W}
          y1={y(e)}
          y2={y(e)}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className="stroke-border"
        />
      ))}
      <path d={area} className="fill-hover" />
      {dayBreaks.map((km) => (
        <line
          key={km}
          x1={x(km)}
          x2={x(km)}
          y1={0}
          y2={H}
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          className="stroke-text-muted"
        />
      ))}
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
      {hover !== undefined && (
        <line
          x1={x(hover)}
          x2={x(hover)}
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
  if (!axes) return chart;

  const pct = (v: number) => `${v.toFixed(2)}%`;
  const hoverEle = hover === undefined ? undefined : eleAt(points, hover);
  const hoverLeft = hover === undefined ? 0 : (x(hover) / W) * 100;

  return (
    <div
      className={cn(
        "flex flex-col text-2xs text-text-muted tabular-nums",
        className,
      )}
    >
      <div className="flex h-20 gap-1">
        <div aria-hidden className="relative w-11 shrink-0">
          {eleTicks.map((e) => (
            <span
              key={e}
              className="absolute right-0 -translate-y-1/2 leading-tight"
              style={{ top: pct((y(e) / H) * 100) }}
            >
              {format.elevation(e)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {chart}
          {hover !== undefined && hoverEle !== undefined && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-0 rounded-sm bg-inverse px-1.5 py-0.5 font-semibold whitespace-nowrap text-on-inverse",
                hoverLeft > 50 && "-translate-x-full",
              )}
              style={{ left: pct(hoverLeft) }}
            >
              {format.distance(hover * 1000)} · {format.elevation(hoverEle)}
            </span>
          )}
        </div>
      </div>
      <div aria-hidden className="relative ml-12 h-4">
        {kmTicks.map((k) => (
          <span
            key={k}
            className="absolute top-0.5 -translate-x-1/2 leading-tight"
            style={{ left: pct((x(k) / W) * 100) }}
          >
            {format.distance(k * 1000)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Elevation at a km, between the nearest points. */
function eleAt(points: ProfilePoint[], km: number): number | undefined {
  const i = points.findIndex((p) => p.km >= km);
  if (i < 0) return points.at(-1)?.ele;
  const b = points[i];
  const a = points[i - 1];
  if (!b) return undefined;
  if (!a || b.km === a.km) return b.ele;
  return a.ele + ((km - a.km) / (b.km - a.km)) * (b.ele - a.ele);
}
