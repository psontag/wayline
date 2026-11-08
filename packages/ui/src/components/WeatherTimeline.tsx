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
import { WET_MM } from "./DayWeather";
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
/** Room above the wind scale for the label of the strongest gust. */
const WIND_PAD = 8;
/** Least distance between the two line labels, in percent of the row. */
const WIND_LABEL_GAP = 28;

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
  const wy = (v: number) => WIND_H - (v / windTop) * (WIND_H - WIND_PAD);
  const windPct = (v: number) => (wy(v) / WIND_H) * 100;
  const windPath = (pick: (h: TimelineHour) => number) =>
    edgeToEdge(shown, (h) => wy(pick(h))).map(
      ([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`,
    );
  const speedLine = windPath((h) => h.wind.speed);
  const gustLine = windPath((h) => h.wind.gusts);
  const windStep = windTop <= 30 ? 10 : windTop <= 60 ? 20 : 50;
  const windTicks: number[] = [];
  for (let v = 0; v <= windTop; v += windStep) windTicks.push(v);
  const topTick = windTicks.at(-1);
  const strongest = shown.reduce<TimelineHour | undefined>(
    (best, h) => (!best || h.wind.gusts > best.wind.gusts ? h : best),
    undefined,
  );
  // The labels name the lines where they end. They must not touch.
  const lastHour = shown.at(-1);
  const speedEnd = lastHour ? windPct(lastHour.wind.speed) : 100;
  const gustEnd = Math.min(
    lastHour ? windPct(lastHour.wind.gusts) : 0,
    speedEnd - WIND_LABEL_GAP,
  );
  // Same limit as "Dry", so a dry day shows no rain scale.
  const hasRain = shown.some((h) => h.rain >= WET_MM);

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
  // Every second hour, away from the edges, so the labels never touch.
  const labelHours: number[] = [];
  for (let h = from + 1; h <= to; h += 2) labelHours.push(h);

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

      {/* The margins hold the scales and line labels, off the charts. */}
      <ChartBody className="gap-1 pr-12 pl-14">
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
          <div ref={chartRef} className="relative h-12">
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
                hasRain && h.rain > 0 ? (
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
              {hasRain && (
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
            {tempTicks.map((c) => (
              <Tick key={c} side="left" top={ty(c)}>
                {format.temperature(c)}
              </Tick>
            ))}
            {hasRain && (
              <Tick side="right" top={rainY(maxRain)}>
                {t("timeline.rainTick", { rain: format.rain(maxRain) })}
              </Tick>
            )}
          </div>

          <div className="relative h-12">
            <svg
              viewBox={`0 0 ${W} ${WIND_H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 block size-full overflow-visible"
              role="img"
              aria-label={t("timeline.windSpeedLabel")}
            >
              {windTicks.map((v) => (
                <line
                  key={v}
                  x1={0}
                  x2={W}
                  y1={wy(v)}
                  y2={wy(v)}
                  strokeWidth={1}
                  strokeDasharray={v === 0 ? undefined : "2 3"}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-border"
                />
              ))}
              {shown.length > 1 && (
                <>
                  <path
                    d={`M${gustLine.join(" L")}`}
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-wind-speed-2"
                  />
                  <path
                    d={`M${speedLine.join(" L")}`}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-wind-speed-3"
                  />
                </>
              )}
            </svg>
            {windTicks.map((v) => (
              <Tick key={v} side="left" top={windPct(v)}>
                {v === topTick ? format.speed(v) : v}
              </Tick>
            ))}
            {strongest && (
              <span
                aria-hidden
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full pb-0.5 text-2xs leading-none font-bold whitespace-nowrap text-text tabular-nums"
                style={{
                  left: pct(strongest.hour + 0.5),
                  top: `${windPct(strongest.wind.gusts)}%`,
                }}
              >
                {format.speed(strongest.wind.gusts)}
              </span>
            )}
            {shown.length > 1 && (
              <>
                <Tick side="right" top={gustEnd}>
                  {t("timeline.gusts")}
                </Tick>
                <Tick side="right" top={speedEnd}>
                  {t("timeline.wind")}
                </Tick>
              </>
            )}
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
              // Keep the last label inside the chart.
              className={cn(
                "absolute",
                h === to ? "-translate-x-full" : "-translate-x-1/2",
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
                  {format.speed(info.wind.speed)}
                  {/* The arrow color says the kind on narrow screens. */}
                  <span className="max-sm:hidden">
                    {" "}
                    {t(`timeline.kind.${info.wind.kind}`)}
                  </span>
                  {" · "}
                  {t("timeline.gustsAt", {
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
export function Tick({
  side,
  top,
  children,
}: {
  side: "left" | "right";
  top: number;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute text-2xs leading-none whitespace-nowrap text-text-muted tabular-nums",
        side === "left" && "right-full -translate-y-1/2 pr-1.5 text-right",
        side === "right" && "left-full -translate-y-1/2 pl-1.5",
      )}
      style={{ top: `${top}%` }}
    >
      {children}
    </span>
  );
}
