import {
  ArrowUp,
  Check,
  CloudRain,
  Sparkles,
  Sunset,
  Thermometer,
  Wind,
} from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { Button } from "./Button";
import { ChartBody, ChartInfo, ChartToolbar } from "./ChartPanel";

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
  /** Suggested start. `reason` says why, e.g. "dry, mostly tailwind". Shown on hover. */
  best?: { start: number; reason: string };
  /** Before the ride time in the toolbar, e.g. a play button. */
  leading?: ReactNode;
  /** Hour the map shows, as a decimal. Without it, there is no marker. */
  time?: number;
  onTimeChange?: (time: number) => void;
  className?: string;
};

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
  leading,
  time,
  onTimeChange,
  className,
}: WeatherTimelineProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const chartRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | undefined>(undefined);
  const [dragStart, setDragStart] = useState<number>();
  const [hovered, setHovered] = useState<number>();

  const span = to - from;
  const latest = Math.max(from, to - duration);
  const clamp = (v: number) =>
    Math.min(latest, Math.max(from, Math.round(v / STEP) * STEP));
  const current = dragStart ?? clamp(start);
  const end = current + duration;
  const pct = (h: number) => `${((h - from) / span) * 100}%`;
  const x = (h: number) => ((h - from) / span) * W;
  // Points at hour centers, held flat to both edges of the chart.
  const edgeToEdge = (list: TimelineHour[], y: (h: TimelineHour) => number) => {
    const first = list[0];
    const last = list.at(-1);
    if (!first || !last) return [];
    return [
      [0, y(first)],
      ...list.map((h) => [x(h.hour + 0.5), y(h)]),
      [W, y(last)],
    ] as [number, number][];
  };

  const shown = hours.filter((h) => h.hour >= from && h.hour < to);
  // Round tops, so the scales read well.
  const maxRain = Math.max(2, Math.ceil(Math.max(...shown.map((h) => h.rain))));
  const temps = shown.map((h) => h.feelsLike);
  const tMin = Math.min(...temps) - 1;
  const tMax = Math.max(...temps) + 1;
  // Temperature in the upper part, rain bars grow from the bottom.
  const ty = (c: number) => 12 + (1 - (c - tMin) / (tMax - tMin || 1)) * 40;
  const tempTicks = [...new Set([Math.floor(tMax), Math.ceil(tMin)])];
  const rainY = (mm: number) => H - (mm / maxRain) * 70;
  const line = edgeToEdge(shown, (h) => ty(h.feelsLike))
    .map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(" L");

  const windTop =
    Math.ceil(Math.max(MIN_WIND_TOP, ...shown.map((h) => h.wind.gusts)) / 10) *
    10;
  const wy = (v: number) => WIND_H - (v / windTop) * (WIND_H - 2);
  const windPath = (pick: (h: TimelineHour) => number) =>
    edgeToEdge(shown, (h) => wy(pick(h))).map(
      ([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`,
    );
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
    if (e.pointerType === "mouse") {
      setHovered(Math.min(to - 1, Math.floor(timeAt(e))));
    }
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

  // The info line shows the hovered hour, else the marker hour.
  const infoHour =
    hovered ??
    (time === undefined ? undefined : Math.min(to - 1, Math.floor(time)));
  const info = hours.find((h) => h.hour === infoHour);
  const summary = describe?.(current);
  const afterSunset = sunset !== undefined && end > sunset;
  const beforeSunrise = sunrise !== undefined && current < sunrise;
  const atBest = best !== undefined && best.start === current;
  const night = [
    ...(sunrise !== undefined && sunrise > from
      ? [{ from, to: Math.min(sunrise, to) }]
      : []),
    ...(sunset !== undefined && sunset < to
      ? [{ from: Math.max(sunset, from), to }]
      : []),
  ];
  const labelHours: number[] = [];
  for (let h = from; h <= to; h++) labelHours.push(h);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ChartToolbar
        start={
          <>
            {leading}
            <p className="flex min-w-0 items-baseline gap-x-2 tabular-nums">
              <span className="shrink-0 font-semibold">
                {t("timeline.ride", {
                  start: format.clock(current),
                  end: format.clock(end),
                })}
              </span>
              {afterSunset || beforeSunrise ? (
                <span className="flex min-w-0 items-center gap-1.5 self-center text-warning">
                  <Sunset className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {afterSunset
                      ? t("timeline.afterSunset", {
                          time: format.clock(sunset ?? 0),
                        })
                      : t("timeline.beforeSunrise", {
                          time: format.clock(sunrise ?? 0),
                        })}
                  </span>
                </span>
              ) : (
                summary && (
                  <span className="truncate text-text-muted">{summary}</span>
                )
              )}
            </p>
          </>
        }
        end={
          best &&
          (atBest ? (
            <span
              className="flex items-center gap-1.5 text-xs text-text-muted"
              title={best.reason}
            >
              <Check className="size-3.5" aria-hidden />
              {t("timeline.atBest")}
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              title={best.reason}
              disabled={!onStartChange}
              onClick={() => onStartChange?.(best.start)}
            >
              <Sparkles aria-hidden />
              {t("timeline.best", { time: format.clock(best.start) })}
            </Button>
          ))
        }
      />

      {/* The left margin holds the scales, as in the elevation chart. */}
      <ChartBody className="gap-1 pl-14">
        <div
          ref={areaRef}
          className={cn(
            "relative flex touch-none flex-col gap-1.5",
            onTimeChange && "cursor-pointer",
          )}
          onPointerDown={onAreaPointerDown}
          onPointerMove={onAreaPointerMove}
          onPointerUp={onAreaPointerUp}
          onPointerCancel={onAreaPointerUp}
          onPointerLeave={() => setHovered(undefined)}
        >
          {hovered !== undefined && (
            <div
              className="pointer-events-none absolute top-0 bottom-7 bg-hover"
              style={{ left: pct(hovered), width: `${(1 / span) * 100}%` }}
            />
          )}
          <div ref={chartRef} className="relative h-16">
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
                    x={x(h.hour) + 10}
                    width={W / span - 20}
                    y={H - (h.rain / maxRain) * 70}
                    height={(h.rain / maxRain) * 70}
                    rx={2}
                    className="fill-rain"
                    // Likely rain is drawn stronger.
                    fillOpacity={0.3 + 0.6 * h.rainChance}
                  />
                ) : null,
              )}
              <line
                x1={0}
                x2={W}
                y1={rainY(maxRain)}
                y2={rainY(maxRain)}
                strokeWidth={1}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
                className="stroke-border"
              />
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
            {tempTicks.map((c) => (
              <Tick key={c} side="left" top={ty(c)}>
                {format.temperature(c)}
              </Tick>
            ))}
            <Tick side="inside" top={rainY(maxRain)}>
              {t("timeline.rainTick", { rain: format.rain(maxRain) })}
            </Tick>
          </div>

          <div className="relative h-8">
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
                    fillOpacity={0.45}
                  />
                  <path
                    d={`M${speedLine.join(" L")}`}
                    fill="none"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-wind-speed-3"
                  />
                </>
              )}
              <line
                x1={0}
                x2={W}
                y1={0}
                y2={0}
                strokeWidth={1}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
                className="stroke-border"
              />
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
            <Tick side="left" top={0}>
              {format.speed(windTop)}
            </Tick>
            <Tick side="left" top={100}>
              0
            </Tick>
          </div>

          <ul className="relative h-3.5" aria-label={t("timeline.windLabel")}>
            {shown.map((h) => (
              <li
                key={h.hour}
                className={cn(
                  "absolute -translate-x-1/2",
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
              </li>
            ))}
          </ul>

          <div className="relative h-5 rounded-sm bg-hover">
            <div className="absolute inset-0 overflow-hidden rounded-sm">
              {night.map((n) => (
                <div
                  key={n.from}
                  className="absolute inset-y-0 bg-night"
                  style={{
                    left: pct(n.from),
                    width: `${((n.to - n.from) / span) * 100}%`,
                  }}
                />
              ))}
            </div>
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
                "absolute inset-y-0 touch-none rounded-sm border-2 border-selected-border bg-selected",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                onStartChange &&
                  (dragStart === undefined ? "cursor-grab" : "cursor-grabbing"),
              )}
              style={{
                left: pct(current),
                width: `${(Math.min(duration, span) / span) * 100}%`,
              }}
            />
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
                  "group absolute inset-y-0 z-10 flex w-6 -translate-x-1/2 items-center justify-center outline-none",
                  onTimeChange && "cursor-ew-resize",
                )}
                style={{ left: pct(time) }}
              >
                <span className="rounded-sm bg-text px-1.5 py-0.5 text-2xs leading-none font-semibold text-surface tabular-nums ring-2 ring-surface group-focus-visible:ring-focus-ring">
                  {format.clock(time)}
                </span>
              </div>
            )}
          </div>
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
                // Every second hour on narrow screens.
                (h - from) % 2 === 1 && "max-sm:hidden",
              )}
              style={{ left: pct(h) }}
            >
              {format.clock(h)}
            </span>
          ))}
        </div>
      </ChartBody>

      <ChartInfo>
        <dl className="flex items-center gap-x-4 [&_dd]:text-text [&_svg]:size-3.5 [&>div]:flex [&>div]:items-center [&>div]:gap-1.5">
          {info && (
            <>
              {hovered !== undefined && (
                <div>
                  <dt className="sr-only">{t("timeline.hour")}</dt>
                  <dd className="font-semibold">{format.clock(info.hour)}</dd>
                </div>
              )}
              <div>
                <dt>
                  <Thermometer aria-label={t("timeline.feelsLike")} />
                </dt>
                <dd>{format.temperature(info.feelsLike)}</dd>
              </div>
              <div>
                <dt>
                  <CloudRain aria-label={t("timeline.rain")} />
                </dt>
                <dd>
                  {t("timeline.rainAt", {
                    rain: format.rain(info.rain),
                    chance: format.percent(info.rainChance),
                  })}
                </dd>
              </div>
              <div>
                <dt>
                  <Wind
                    className={windColor[info.wind.kind]}
                    aria-label={t("timeline.wind")}
                  />
                </dt>
                <dd>
                  {t("timeline.windAt", {
                    speed: format.speed(info.wind.speed),
                    kind: t(`timeline.kind.${info.wind.kind}`),
                    gusts: format.speed(info.wind.gusts),
                  })}
                </dd>
              </div>
            </>
          )}
        </dl>
      </ChartInfo>
    </div>
  );
}

/** A value on the scale beside a chart row. top is in percent. */
function Tick({
  side,
  top,
  children,
}: {
  /** inside: at the right edge, above the line. */
  side: "left" | "right" | "inside";
  top: number;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute text-2xs leading-none whitespace-nowrap text-text-muted tabular-nums",
        side === "left" && "right-full -translate-y-1/2 pr-1.5 text-right",
        side === "right" && "left-full -translate-y-1/2 pl-1.5",
        side === "inside" && "right-1 -translate-y-full pb-0.5",
      )}
      style={{ top: `${top}%` }}
    >
      {children}
    </span>
  );
}
