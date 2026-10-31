import { ArrowUp, Check, Sparkles, Sunset } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { Button } from "./Button";

export type WindKind = "head" | "tail" | "cross";

export type TimelineHour = {
  /** Start of the hour, 0 to 23. */
  hour: number;
  /** mm in this hour. */
  rain: number;
  /** 0 to 1 */
  rainChance: number;
  /** °C */
  feelsLike: number;
  wind: {
    kind: WindKind;
    /** Where the wind blows to, relative to the way ahead. 0 = tailwind. */
    rotation: number;
    /** km/h */
    speed: number;
    gusts: number;
  };
};

export type WeatherTimelineProps = {
  hours: TimelineHour[];
  /** First and last hour on the axis. */
  from?: number;
  to?: number;
  /** Hours as decimals, e.g. 16.75 for 16:45. */
  sunrise?: number;
  sunset?: number;
  /** Start of the ride window, in hours. */
  start: number;
  /** Riding time in hours. */
  duration: number;
  /** Called when a drag ends. Without it, the window can't be moved. */
  onStartChange?: (start: number) => void;
  /** Short text about the ride from a start, e.g. "Rain until 09:00". */
  describe?: (start: number) => string | undefined;
  /** Suggested start. `reason` says why, e.g. "dry, mostly tailwind". */
  best?: { start: number; reason: string };
  /** Hour the map shows, as a decimal. Without it, there is no marker. */
  time?: number;
  onTimeChange?: (time: number) => void;
  className?: string;
};

/** Gusts from this speed are shown. */
const HIGH_GUSTS_KMH = 40;
const STEP = 0.5;
const TIME_STEP = 0.25;
/** Top of the wind axis, unless gusts are stronger. */
const MIN_WIND_TOP = 30;

const windColor: Record<WindKind, string> = {
  head: "text-wind-head",
  cross: "text-wind-cross",
  tail: "text-wind-tail",
};

const W = 1000;
const H = 100;
const WIND_H = 40;

/**
 * Weather by hour for one day: rain, wind relative to the route,
 * feels-like temperature and daylight. The ride window can be dragged in
 * half-hour steps.
 */
export function WeatherTimeline({
  hours,
  from = 7,
  to = 19,
  sunrise,
  sunset,
  start,
  duration,
  onStartChange,
  describe,
  best,
  time,
  onTimeChange,
  className,
}: WeatherTimelineProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const chartRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | undefined>(undefined);
  const [dragStart, setDragStart] = useState<number>();

  const span = to - from;
  const latest = Math.max(from, to - duration);
  const clamp = (v: number) =>
    Math.min(latest, Math.max(from, Math.round(v / STEP) * STEP));
  const current = dragStart ?? clamp(start);
  const end = current + duration;
  const pct = (h: number) => `${((h - from) / span) * 100}%`;
  const x = (h: number) => ((h - from) / span) * W;

  const shown = hours.filter((h) => h.hour >= from && h.hour < to);
  const maxRain = Math.max(2, ...shown.map((h) => h.rain));
  const temps = shown.map((h) => h.feelsLike);
  const tMin = Math.min(...temps) - 1;
  const tMax = Math.max(...temps) + 1;
  // Temperature in the upper part, rain bars grow from the bottom.
  const ty = (c: number) => 12 + (1 - (c - tMin) / (tMax - tMin || 1)) * 40;
  const line = shown
    .map((h) => `${x(h.hour + 0.5).toFixed(1)} ${ty(h.feelsLike).toFixed(1)}`)
    .join(" L");

  const windTop = Math.max(MIN_WIND_TOP, ...shown.map((h) => h.wind.gusts));
  const wy = (v: number) => WIND_H - (v / windTop) * (WIND_H - 2);
  const windPath = (pick: (h: TimelineHour) => number) =>
    shown.map((h) => `${x(h.hour + 0.5).toFixed(1)} ${wy(pick(h)).toFixed(1)}`);
  const speedLine = windPath((h) => h.wind.speed);
  const gustBand = [
    ...windPath((h) => h.wind.gusts),
    ...windPath((h) => h.wind.speed).reverse(),
  ];

  const clampTime = (v: number) =>
    Math.min(to, Math.max(from, Math.round(v / TIME_STEP) * TIME_STEP));
  const areaRef = useRef<HTMLDivElement>(null);
  const timeDrag = useRef(false);
  const timeAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = areaRef.current?.getBoundingClientRect();
    if (!box) return from;
    return clampTime(from + ((e.clientX - box.left) / (box.width || 1)) * span);
  };
  const onAreaPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onTimeChange) return;
    // The ride window has its own drag.
    if (e.target instanceof Element && e.target.closest("[data-window]"))
      return;
    e.currentTarget.setPointerCapture(e.pointerId);
    timeDrag.current = true;
    onTimeChange(timeAt(e));
  };
  const onAreaPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (timeDrag.current) onTimeChange?.(timeAt(e));
  };
  const onAreaPointerUp = () => {
    timeDrag.current = false;
  };
  const onTimeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (time === undefined || !onTimeChange) return;
    const step = e.shiftKey ? 1 : TIME_STEP;
    const keys: Record<string, number> = {
      ArrowLeft: time - step,
      ArrowRight: time + step,
      Home: from,
      End: to,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onTimeChange(clampTime(next));
  };

  const move = (value: number, done: boolean) => {
    const next = clamp(value);
    if (done) {
      setDragStart(undefined);
      if (next !== clamp(start)) onStartChange?.(next);
    } else {
      setDragStart(next);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onStartChange) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: current };
    setDragStart(current);
  };
  const deltaHours = (e: PointerEvent<HTMLDivElement>) => {
    const width = chartRef.current?.getBoundingClientRect().width || 1;
    return ((e.clientX - (drag.current?.x ?? 0)) / width) * span;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) move(drag.current.start + deltaHours(e), false);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    move(drag.current.start + deltaHours(e), true);
    drag.current = undefined;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowLeft: current - STEP,
      ArrowRight: current + STEP,
      Home: from,
      End: latest,
    };
    const next = keys[e.key];
    if (next === undefined || !onStartChange) return;
    e.preventDefault();
    move(next, true);
  };

  const marked =
    time === undefined
      ? undefined
      : hours.find((h) => h.hour === Math.min(to - 1, Math.floor(time)));
  const summary = describe?.(current);
  const afterSunset = sunset !== undefined && end > sunset;
  const beforeSunrise = sunrise !== undefined && current < sunrise;
  const atBest = best !== undefined && best.start === current;
  const labelHours: number[] = [];
  for (let h = from; h <= to; h += 2) labelHours.push(h);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="font-semibold">
            {t("timeline.ride", {
              start: format.clock(current),
              end: format.clock(end),
            })}
          </span>
          {summary && <span className="text-text-muted">{summary}</span>}
        </p>
        {best &&
          (atBest ? (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <Check className="size-3.5" aria-hidden />
              {t("timeline.atBest", { reason: best.reason })}
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={!onStartChange}
              onClick={() => onStartChange?.(best.start)}
            >
              <Sparkles aria-hidden />
              {t("timeline.best", {
                time: format.clock(best.start),
                reason: best.reason,
              })}
            </Button>
          ))}
      </div>

      <div className="flex flex-col gap-1">
        <ul
          className="relative h-9 text-2xs tabular-nums"
          aria-label={t("timeline.windLabel")}
        >
          {shown.map((h) => (
            <li
              key={h.hour}
              className={cn(
                "absolute flex -translate-x-1/2 flex-col items-center leading-tight",
                windColor[h.wind.kind],
              )}
              style={{ left: pct(h.hour + 0.5) }}
            >
              <ArrowUp
                className="size-3.5"
                style={{ transform: `rotate(${h.wind.rotation}deg)` }}
                role="img"
                aria-label={t(`weather.wind.${h.wind.kind}`)}
              />
              <span>{Math.round(h.wind.speed)}</span>
              {h.wind.gusts >= HIGH_GUSTS_KMH && (
                <span className="font-bold">
                  {t("timeline.gust", { speed: Math.round(h.wind.gusts) })}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div
          ref={areaRef}
          className={cn(
            "relative mt-2 flex touch-none flex-col gap-1",
            onTimeChange && "cursor-pointer",
          )}
          onPointerDown={onAreaPointerDown}
          onPointerMove={onAreaPointerMove}
          onPointerUp={onAreaPointerUp}
          onPointerCancel={onAreaPointerUp}
        >
          <div ref={chartRef} className="relative h-20">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 block size-full overflow-visible"
              role="img"
              aria-label={t("timeline.label")}
            >
              {sunrise !== undefined && sunrise > from && (
                <rect
                  x={0}
                  y={0}
                  width={x(Math.min(sunrise, to))}
                  height={H}
                  className="fill-night"
                />
              )}
              {sunset !== undefined && sunset < to && (
                <rect
                  x={x(Math.max(sunset, from))}
                  y={0}
                  width={W - x(Math.max(sunset, from))}
                  height={H}
                  className="fill-night"
                />
              )}
              {shown.map((h) =>
                h.rain > 0 ? (
                  <rect
                    key={h.hour}
                    x={x(h.hour) + 8}
                    width={W / span - 16}
                    y={H - (h.rain / maxRain) * 70}
                    height={(h.rain / maxRain) * 70}
                    rx={2}
                    className="fill-rain"
                    // Likely rain is drawn stronger.
                    fillOpacity={0.35 + 0.65 * h.rainChance}
                  />
                ) : null,
              )}
              <line
                x1={0}
                x2={W}
                y1={H}
                y2={H}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className="stroke-border"
              />
              {shown.length > 1 && (
                <path
                  d={`M${line}`}
                  fill="none"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-text-muted"
                />
              )}
            </svg>

            <div
              data-window
              role="slider"
              tabIndex={onStartChange ? 0 : -1}
              aria-label={t("timeline.window")}
              aria-valuemin={from}
              aria-valuemax={latest}
              aria-valuenow={current}
              aria-valuetext={t("timeline.ride", {
                start: format.clock(current),
                end: format.clock(end),
              })}
              aria-readonly={!onStartChange}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              className={cn(
                "absolute inset-y-0 touch-none rounded-sm border-2 border-selected-border bg-selected/40",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                onStartChange &&
                  (dragStart === undefined ? "cursor-grab" : "cursor-grabbing"),
              )}
              style={{
                left: pct(current),
                width: `${(Math.min(duration, span) / span) * 100}%`,
              }}
            />
            {shown
              .filter((h) => h.rain >= 0.3)
              .map((h) => (
                <span
                  key={h.hour}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-2xs font-semibold text-rain tabular-nums"
                  style={{
                    left: pct(h.hour + 0.5),
                    top: `${100 - (h.rain / maxRain) * 70}%`,
                  }}
                >
                  {format.rain(h.rain)}
                </span>
              ))}
            {shown
              .filter((h) => (h.hour - from) % 3 === 1)
              .map((h) => (
                <span
                  key={h.hour}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-full pb-0.5 text-2xs text-text-muted tabular-nums"
                  style={{
                    left: pct(h.hour + 0.5),
                    top: `${ty(h.feelsLike)}%`,
                  }}
                >
                  {format.temperature(h.feelsLike)}
                </span>
              ))}
          </div>

          <div className="relative h-10">
            <svg
              viewBox={`0 0 ${W} ${WIND_H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 block size-full overflow-visible"
              role="img"
              aria-label={t("timeline.windSpeedLabel")}
            >
              {shown.length > 1 && (
                <>
                  <path
                    d={`M${gustBand.join(" L")} Z`}
                    className="fill-wind-speed-1"
                    fillOpacity={0.6}
                  />
                  <path
                    d={`M${speedLine.join(" L")}`}
                    fill="none"
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-wind-speed-3"
                  />
                </>
              )}
              <line
                x1={0}
                x2={W}
                y1={WIND_H}
                y2={WIND_H}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className="stroke-border"
              />
            </svg>
            <span className="pointer-events-none absolute top-0 right-0 text-2xs text-text-muted tabular-nums">
              {t("timeline.windTop", { speed: Math.round(windTop) })}
            </span>
          </div>

          {time !== undefined && (
            <div
              role="slider"
              tabIndex={onTimeChange ? 0 : -1}
              aria-label={t("timeline.time")}
              aria-valuemin={from}
              aria-valuemax={to}
              aria-valuenow={time}
              aria-valuetext={format.clock(time)}
              aria-readonly={!onTimeChange}
              onKeyDown={onTimeKeyDown}
              className={cn(
                "group absolute inset-y-0 z-10 flex w-6 -translate-x-1/2 justify-center outline-none",
                onTimeChange && "cursor-ew-resize",
              )}
              style={{ left: pct(time) }}
            >
              <span className="w-0.5 bg-text" />
              <span className="absolute -top-1.5 size-3 rounded-full bg-text ring-2 ring-surface group-focus-visible:ring-focus-ring" />
            </div>
          )}
        </div>

        <div className="relative h-4 text-2xs text-text-muted tabular-nums">
          {labelHours.map((h) => (
            <span
              key={h}
              // Keep the outer labels inside the chart.
              className={cn(
                "absolute",
                h === from
                  ? ""
                  : h === to
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: pct(h) }}
            >
              {format.clock(h)}
            </span>
          ))}
        </div>
      </div>

      {marked && time !== undefined && (
        <p className="text-xs tabular-nums">
          {t("timeline.at", {
            time: format.clock(time),
            feelsLike: format.temperature(marked.feelsLike),
            rain: format.rain(marked.rain),
            chance: format.percent(marked.rainChance),
            speed: format.speed(marked.wind.speed),
            kind: t(`timeline.kind.${marked.wind.kind}`),
            gusts: Math.round(marked.wind.gusts),
          })}
        </p>
      )}

      {(afterSunset || beforeSunrise) && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <Sunset className="size-3.5" aria-hidden />
          {afterSunset
            ? t("timeline.afterSunset", { time: format.clock(sunset ?? 0) })
            : t("timeline.beforeSunrise", { time: format.clock(sunrise ?? 0) })}
        </p>
      )}
    </div>
  );
}
