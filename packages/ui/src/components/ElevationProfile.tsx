import { type PointerEvent, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { SurfaceLegend } from "./SurfaceBar";

export type SurfaceKind = "paved" | "gravel" | "unpaved" | "unknown";

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
  /**
   * A second profile for part of the route, e.g. the route as proposed. Drawn
   * as a soft grey area. Its km must match `points`.
   */
  compare?: { km: number; ele: number }[];
  /** Show `compare` stronger. */
  compareHighlighted?: boolean;
  /**
   * Show height labels in m, km ticks, the surface strip and a readout on
   * hover. Hover works without `onHoverKm`.
   */
  axes?: boolean;
  /** km where a new day starts. Drawn as lines with the stop number. */
  dayBreaks?: number[];
  /** Climbs, filled under the line by grade. */
  climbs?: { startKm: number; endKm: number; gain?: number }[];
  /** Index of the climb to show stronger. */
  highlightedClimb?: number;
  /** Describes the chart for screen readers. */
  "aria-label": string;
  /** Card with the values at the pointer. Off when a ChartInfo shows them. */
  tooltip?: boolean;
  className?: string;
};

type Point = { km: number; ele: number };

const NONE: Point[] = [];

const W = 1000;
const H = 100;
// Keep the line off the top and bottom edges without axes.
const PAD = 8;
// More points than this add no detail at chart width.
const MAX_POINTS = 400;

const surfaceColor: Record<SurfaceKind, string> = {
  paved: "bg-terrain-paved",
  gravel: "bg-terrain-gravel",
  unpaved: "bg-terrain-unpaved",
  unknown: "bg-terrain-unknown",
};

// Grade classes for climbs, as shares: under 4 %, 4–7 %, over 7 %.
const GRADES = [0.04, 0.07];
const gradeFill = ["fill-grade-1", "fill-grade-2", "fill-grade-3"] as const;
const gradeBg = ["bg-grade-1", "bg-grade-2", "bg-grade-3"] as const;
// Climbs narrower than this share of the chart get no gain label.
const LABEL_MIN_WIDTH = 0.06;

/** Grade class of a grade given as a share: 0, 1 or 2. */
export function gradeClass(grade: number): number {
  return GRADES.filter((g) => grade >= g).length;
}

/** Round step that splits `range` into about `count` parts. */
export function niceStep(
  range: number,
  count: number,
  steps = [1, 2, 2.5, 5, 10],
): number {
  const raw = range / count;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const step = steps.find((s) => s * power >= raw) ?? 10;
  return step * power;
}

/**
 * Moving average over `radius` km on each side, then thinned to about
 * `MAX_POINTS`. Removes height noise but keeps real climbs. Surface changes
 * are kept.
 */
export function smooth<T extends Point>(points: T[], radius: number): T[] {
  if (points.length < 3 || radius <= 0) return points;
  const kms = points.map((p) => p.km);
  const eles = points.map((p) => p.ele);
  const out: T[] = [];
  let from = 0;
  let to = 0;
  let sum = 0;
  for (const p of points) {
    while (to < points.length && (kms[to] ?? Infinity) <= p.km + radius) {
      sum += eles[to] ?? 0;
      to++;
    }
    while ((kms[from] ?? Infinity) < p.km - radius) {
      sum -= eles[from] ?? 0;
      from++;
    }
    out.push({ ...p, ele: sum / (to - from) });
  }
  const every = Math.ceil(points.length / MAX_POINTS);
  if (every === 1) return out;
  const surface = (p?: Point) =>
    (p as Partial<ProfilePoint> | undefined)?.surface;
  return out.filter(
    (p, i) =>
      i % every === 0 ||
      i === out.length - 1 ||
      surface(p) !== surface(out[i - 1]),
  );
}

/**
 * Monotone cubic path through the points (Fritsch–Carlson). It never
 * overshoots, so peaks and valleys stay where the data has them.
 */
export function curve(pts: [number, number][]): string[] {
  const pairs = pts.slice(1).map((b, i) => [pts[i] ?? b, b] as const);
  const d = pairs.map(([[x0, y0], [x1, y1]]) =>
    x1 === x0 ? 0 : (y1 - y0) / (x1 - x0),
  );
  const m = pts.map((_, i) => {
    const a = d[i - 1] ?? d[i] ?? 0;
    const b = d[i] ?? a;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  const f = (v: number) => v.toFixed(1);
  return pairs.map(([[x0, y0], [x1, y1]], i) => {
    const t = (x1 - x0) / 3;
    const m0 = m[i] ?? 0;
    const m1 = m[i + 1] ?? 0;
    return `C${f(x0 + t)} ${f(y0 + m0 * t)} ${f(x1 - t)} ${f(y1 - m1 * t)} ${f(x1)} ${f(y1)}`;
  });
}

/** Elevation at a km, between the nearest points. */
export function eleAt(points: Point[], km: number): number | undefined {
  const i = points.findIndex((p) => p.km >= km);
  if (i < 0) return points.at(-1)?.ele;
  const b = points[i];
  const a = points[i - 1];
  if (!b) return undefined;
  if (!a || b.km === a.km) return b.ele;
  return a.ele + ((km - a.km) / (b.km - a.km)) * (b.ele - a.ele);
}

/** Color key for the climb fills in the profile. */
export function ClimbLegend() {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const [low = 0, high = 0] = GRADES.map(format.percent);
  const labels = [
    t("climbs.below", { grade: low }),
    t("climbs.between", { from: low, to: high }),
    t("climbs.above", { grade: high }),
  ];
  return (
    <div className="flex items-center gap-2.5 text-xs text-text-muted">
      <span>{t("climbs.legend")}</span>
      {labels.map((label, i) => (
        <span key={label} className="flex items-center gap-1">
          <span className={cn("size-2.5 rounded-sm", gradeBg[i])} />
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Elevation over distance. With axes, a strip under the chart shows the
 * surface.
 */
export function ElevationProfile({
  points,
  compare = NONE,
  compareHighlighted = false,
  hoverKm,
  onHoverKm,
  axes = false,
  dayBreaks = [],
  climbs = [],
  highlightedClimb,
  "aria-label": ariaLabel,
  tooltip = true,
  className,
}: ElevationProfileProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const fillId = `ele-fill-${useId().replace(/[^\w-]/g, "")}`;
  const [ownHover, setOwnHover] = useState<number>();
  const chart = useMemo(
    () => geometry(points, compare, climbs, axes),
    [points, compare, climbs, axes],
  );

  if (!chart) {
    return axes ? (
      <div aria-hidden className={cn("flex flex-col gap-1", className)}>
        <div className="flex min-h-24 flex-1 flex-col justify-between pl-14">
          <div className="border-t border-border" />
          <div className="border-t border-border" />
          <div className="border-t border-border" />
        </div>
        <div className="h-12" />
      </div>
    ) : (
      <div className={cn("h-20", className)} />
    );
  }

  const { first, length, x, y, line, compareLine, eleTicks, kmTicks } = chart;
  const area = `${line.path} L${W} ${H} L0 ${H} Z`;

  const setHover = onHoverKm ?? (axes ? setOwnHover : undefined);
  const hover = hoverKm ?? (onHoverKm ? undefined : ownHover);
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover?.(first + f * length);
  };
  const lineY = (km: number) => y(eleAt(line.points, km) ?? 0);

  const svg = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      onPointerMove={setHover && onMove}
      onPointerLeave={setHover && (() => setHover(undefined))}
      className={cn(
        "block w-full touch-none overflow-visible",
        axes ? "h-full" : "h-20",
        !axes && className,
      )}
    >
      <defs>
        <linearGradient
          id={fillId}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
          className="text-text"
        >
          <stop offset="0" stopColor="currentColor" stopOpacity={0.1} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0.02} />
        </linearGradient>
      </defs>
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
      <path d={area} fill={`url(#${fillId})`} />
      {chart.climbs.map((climb, i) => (
        <g
          key={climb.startKm}
          className={cn(
            highlightedClimb !== undefined &&
              i !== highlightedClimb &&
              "opacity-40",
          )}
        >
          {climb.runs.map((run) => (
            <path key={run.d} d={run.d} className={gradeFill[run.grade]} />
          ))}
        </g>
      ))}
      {compareLine && (
        <g className={compareHighlighted ? "opacity-100" : "opacity-50"}>
          <path d={compareLine.area} className="fill-proposed opacity-30" />
          <path
            d={compareLine.path}
            fill="none"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="stroke-proposed"
          />
        </g>
      )}
      {dayBreaks.map((km) => (
        <line
          key={km}
          x1={x(km)}
          x2={x(km)}
          y1={lineY(km)}
          y2={H}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className="stroke-text opacity-40"
        />
      ))}
      <path
        d={line.path}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-text"
      />
      {hover !== undefined && (
        <line
          x1={x(hover)}
          x2={x(hover)}
          y1={0}
          y2={H}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className="stroke-text-muted"
        />
      )}
    </svg>
  );
  if (!axes) return svg;

  const pct = (v: number) => `${v.toFixed(2)}%`;
  const left = (km: number) => pct((x(km) / W) * 100);
  const top = (svgY: number) => pct((svgY / H) * 100);
  const hoverEle = hover === undefined ? undefined : eleAt(points, hover);
  const hoverRight = hover !== undefined && x(hover) > W / 2;
  // Grade over a short stretch of the smoothed line, so single height
  // samples don't make it jump.
  const grade =
    hover === undefined
      ? undefined
      : gradeAt(line.points, hover, Math.max(0.1, length / 400));
  const compareEnds = compareLine
    ? [compareLine.startKm, compareLine.endKm]
    : [];
  const { highest } = chart;

  return (
    <div
      className={cn(
        "flex flex-col text-xs text-text-muted tabular-nums",
        className,
      )}
    >
      {dayBreaks.length > 0 && (
        <div aria-hidden className="relative ml-14 h-5">
          {dayBreaks.map((km, i) => (
            <span
              key={km}
              className="absolute top-0 flex size-4 -translate-x-1/2 items-center justify-center rounded-full bg-marker text-2xs leading-none font-extrabold text-surface"
              style={{ left: left(km) }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      )}
      <div className="flex min-h-24 flex-1 gap-2">
        <div aria-hidden className="relative w-12 shrink-0">
          {eleTicks.map((e) => (
            <span
              key={e}
              className="absolute right-0 -translate-y-1/2 leading-tight whitespace-nowrap"
              style={{ top: top(y(e)) }}
            >
              {format.elevation(e)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {svg}
          <div aria-hidden className="pointer-events-none">
            {chart.climbs
              .filter((c) => (c.endKm - c.startKm) / length >= LABEL_MIN_WIDTH)
              .map((c) => (
                <span
                  key={c.startKm}
                  className="absolute bottom-0.5 -translate-x-1/2 text-2xs leading-none font-bold whitespace-nowrap text-text"
                  style={{ left: left((c.startKm + c.endKm) / 2) }}
                >
                  {t("climbs.gain", { gain: format.elevation(c.gain) })}
                </span>
              ))}
            {highest && (
              <span
                className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center pb-0.5 text-2xs leading-none font-bold whitespace-nowrap text-text"
                style={{ left: left(highest.km), top: top(lineY(highest.km)) }}
              >
                {format.elevation(highest.ele)}
              </span>
            )}
            {compareEnds.map((km) => (
              <span
                key={km}
                className="absolute size-1.5 -translate-1/2 rounded-full bg-proposed"
                style={{ left: left(km), top: top(lineY(km)) }}
              />
            ))}
          </div>
          {hover !== undefined && hoverEle !== undefined && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute size-2.5 -translate-1/2 rounded-full border-2 border-surface bg-text shadow-sm"
                style={{ left: left(hover), top: top(lineY(hover)) }}
              />
              {compareLine &&
                hover >= compareLine.startKm &&
                hover <= compareLine.endKm && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-proposed"
                    style={{
                      left: left(hover),
                      top: top(y(eleAt(compareLine.points, hover) ?? 0)),
                    }}
                  />
                )}
              {tooltip && (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-0 flex flex-col rounded-md border border-border bg-surface-raised px-2 py-1 whitespace-nowrap text-text shadow-md",
                    hoverRight ? "-translate-x-full -ml-2" : "ml-2",
                  )}
                  style={{ left: left(hover) }}
                >
                  <span className="font-bold">
                    {format.distance(hover * 1000)}
                  </span>
                  <span className="text-text-muted">
                    {format.elevation(hoverEle)}
                    {grade !== undefined && ` · ${format.grade(grade)}`}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div aria-hidden className="relative ml-14 h-5">
        {kmTicks.map((k) => (
          <span
            key={k}
            className="absolute top-1 -translate-x-1/2 leading-tight whitespace-nowrap"
            style={{ left: left(k) }}
          >
            {format.distance(k * 1000)}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-right text-2xs leading-none">
          {t("surface.title")}
        </span>
        <div
          aria-hidden
          className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
        >
          {line.surfaces.map((run) => (
            <span
              key={run.startKm}
              className={cn("absolute inset-y-0", surfaceColor[run.surface])}
              style={{
                left: left(run.startKm),
                width: pct(((x(run.endKm) - x(run.startKm)) / W) * 100),
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-1.5 ml-14">
        <SurfaceLegend
          unknown={line.surfaces.some((r) => r.surface === "unknown")}
        />
      </div>
    </div>
  );
}

/** Rise over run around `km`, as a share. */
export function gradeAt(
  points: Point[],
  km: number,
  half: number,
): number | undefined {
  const first = points[0]?.km ?? 0;
  const last = points.at(-1)?.km ?? 0;
  const a = Math.max(first, km - half);
  const b = Math.min(last, km + half);
  const ea = eleAt(points, a);
  const eb = eleAt(points, b);
  if (b <= a || ea === undefined || eb === undefined) return undefined;
  return (eb - ea) / ((b - a) * 1000);
}

function geometry(
  points: ProfilePoint[],
  compare: Point[],
  climbs: NonNullable<ElevationProfileProps["climbs"]>,
  axes: boolean,
) {
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  if (!firstPoint || !lastPoint || points.length < 2) return undefined;

  const first = firstPoint.km;
  const length = lastPoint.km - first || 1;
  const radius = length / 200;
  const shown = smooth(points, radius);
  const shownCompare = smooth(compare, radius);
  const head = shown[0];
  if (!head) return undefined;

  const eles = [...shown, ...shownCompare].map((p) => p.ele);
  let min = Math.min(...eles);
  let max = Math.max(...eles);
  let pad = PAD;
  let eleStep = niceStep(Math.max(max - min, 40), 4, [1, 2, 5, 10]);
  // At most 4 bands, so the labels have room.
  while (Math.ceil(max / eleStep) - Math.floor(min / eleStep) > 4) {
    eleStep = niceStep(eleStep * 1.5, 1, [1, 2, 5, 10]);
  }
  if (axes) {
    min = Math.floor(min / eleStep) * eleStep;
    max = Math.ceil(max / eleStep) * eleStep;
    if (max === min) max = min + eleStep;
    pad = 0;
  }
  const range = max - min || 1;
  const x = (km: number) => ((km - first) / length) * W;
  const y = (ele: number) => H - pad - ((ele - min) / range) * (H - 2 * pad);
  const xy = (p: Point): [number, number] => [x(p.km), y(p.ele)];
  const f = (v: number) => v.toFixed(1);
  const moveTo = (p: Point) => {
    const [px, py] = xy(p);
    return `M${f(px)} ${f(py)}`;
  };

  const segments = curve(shown.map(xy));
  // Area under the line from point `from` to point `to`.
  const areaOf = (from: number, to: number) => {
    const a = shown[from];
    const b = shown[to];
    if (!a || !b || to <= from) return undefined;
    return `${moveTo(a)}${segments.slice(from, to).join("")}L${f(x(b.km))} ${H}L${f(x(a.km))} ${H}Z`;
  };

  const surfaces: { surface: SurfaceKind; startKm: number; endKm: number }[] =
    [];
  for (const p of points) {
    const last = surfaces.at(-1);
    if (last && last.surface === p.surface) last.endKm = p.km;
    else {
      if (last) last.endKm = p.km;
      surfaces.push({ surface: p.surface, startKm: p.km, endKm: p.km });
    }
  }

  // Each climb is split into runs of one grade class.
  const half = Math.max(0.1, length / 300);
  const shownClimbs = climbs.map((c) => {
    const inside = shown.flatMap((p, i) =>
      p.km >= c.startKm && p.km <= c.endKm ? [i] : [],
    );
    const runs: { grade: number; d: string }[] = [];
    let from = inside[0];
    let grade: number | undefined;
    for (const i of inside) {
      const next = shown[i + 1];
      const p = shown[i];
      if (!p) continue;
      const g = gradeClass(
        gradeAt(shown, next ? (p.km + next.km) / 2 : p.km, half) ?? 0,
      );
      if (grade !== undefined && g !== grade && from !== undefined) {
        const d = areaOf(from, i);
        if (d) runs.push({ grade, d });
        from = i;
      }
      grade = g;
    }
    const last = inside.at(-1);
    if (from !== undefined && last !== undefined && grade !== undefined) {
      const d = areaOf(from, last);
      if (d) runs.push({ grade, d });
    }
    const gain =
      c.gain ??
      Math.max(
        0,
        (eleAt(points, c.endKm) ?? 0) - (eleAt(points, c.startKm) ?? 0),
      );
    return { startKm: c.startKm, endKm: c.endKm, gain, runs };
  });

  const compareStart = shownCompare[0];
  const compareEnd = shownCompare.at(-1);
  let compareLine;
  if (compareStart && compareEnd && shownCompare.length > 1) {
    const path = moveTo(compareStart) + curve(shownCompare.map(xy)).join("");
    compareLine = {
      path,
      area: `${path}L${f(x(compareEnd.km))} ${H}L${f(x(compareStart.km))} ${H}Z`,
      points: shownCompare,
      startKm: compareStart.km,
      endKm: compareEnd.km,
    };
  }

  const highest = axes
    ? points.reduce((best, p) => (p.ele > best.ele ? p : best), firstPoint)
    : undefined;

  const eleTicks: number[] = [];
  const kmTicks: number[] = [];
  if (axes) {
    for (let e = min; e <= max; e += eleStep) eleTicks.push(e);
    const kmStep = niceStep(length, 5, [1, 2, 5, 10]);
    for (
      let k = Math.ceil(first / kmStep) * kmStep || kmStep;
      k < first + length - kmStep / 3;
      k += kmStep
    ) {
      kmTicks.push(k);
    }
  }

  return {
    first,
    length,
    x,
    y,
    line: { points: shown, path: moveTo(head) + segments.join(""), surfaces },
    climbs: shownClimbs,
    compareLine,
    highest,
    eleTicks,
    kmTicks,
  };
}
