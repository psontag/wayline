import { ArrowUp, CloudRain, Thermometer, Wind } from "lucide-react";
import { type PointerEvent, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { ChartBody, ChartInfo, ChartToolbar } from "./ChartPanel";
import { niceStep } from "./ElevationProfile";
import { Tick, type WindKind } from "./WeatherTimeline";

export type RouteWeatherPoint = {
  /** km from the trip start. */
  km: number;
  /** 0 for the first day. */
  day: number;
  /** mm per hour. */
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

export type TripWeatherProfileProps<P extends RouteWeatherPoint> = {
  /** In km order, at the time the rider passes. */
  points: P[];
  /** km of the crosshair. */
  hoverKm?: number;
  onHoverKm?: (km: number | undefined) => void;
  /** Toolbar text, e.g. a summary of the trip. */
  summary?: ReactNode;
  /** Info line text before the values, e.g. "Day 2 · 11:40 · 84 km". */
  describe?: (point: P) => string;
  className?: string;
};

const W = 1000;
const H = 100;
const WIND_H = 40;
const WIND_PAD = 8;
const MIN_WIND_TOP = 30;
/** Enough to read the wind, few enough for a phone. */
const MAX_ARROWS = 16;

const windColor: Record<WindKind, string> = {
  head: "text-wind-head",
  cross: "text-wind-cross",
  tail: "text-wind-tail",
};

/**
 * Weather along a whole trip at the time the rider passes: rain,
 * feels-like temperature and wind relative to the route, with day breaks.
 */
export function TripWeatherProfile<P extends RouteWeatherPoint>({
  points,
  hoverKm,
  onHoverKm,
  summary,
  describe,
  className,
}: TripWeatherProfileProps<P>) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const chart = useMemo(() => geometry(points), [points]);

  if (!chart) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <ChartToolbar start={summary} />
        <ChartBody>{null}</ChartBody>
        <ChartInfo />
      </div>
    );
  }

  const { length, x, days, breaks, kmTicks } = chart;
  const pct = (km: number) => `${((x(km) / W) * 100).toFixed(2)}%`;

  const maxRain = Math.max(
    2,
    Math.ceil(Math.max(...points.map((p) => p.rain))),
  );
  const temps = points.map((p) => p.feelsLike);
  const tMin = Math.min(...temps) - 1;
  const tMax = Math.max(...temps) + 1;
  const ty = (c: number) => 12 + (1 - (c - tMin) / (tMax - tMin || 1)) * 40;
  const tempTicks = [...new Set([Math.floor(tMax), Math.ceil(tMin)])];
  const rainY = (mm: number) => H - (mm / maxRain) * 70;
  const hasRain = points.some((p) => p.rain > 0);

  const windTop =
    Math.ceil(Math.max(MIN_WIND_TOP, ...points.map((p) => p.wind.gusts)) / 10) *
    10;
  const wy = (v: number) => WIND_H - (v / windTop) * (WIND_H - WIND_PAD);
  const windPct = (v: number) => (wy(v) / WIND_H) * 100;
  const windStep = windTop <= 30 ? 10 : windTop <= 60 ? 20 : 50;
  const windTicks: number[] = [];
  for (let v = 0; v <= windTop; v += windStep) windTicks.push(v);
  const topTick = windTicks.at(-1);

  // One line per day: the night between two days has no weather.
  const path = (y: (p: RouteWeatherPoint) => number) =>
    days
      .filter((d) => d.length > 1)
      .map(
        (d) =>
          "M" +
          d.map((p) => `${x(p.km).toFixed(1)} ${y(p).toFixed(1)}`).join(" L"),
      )
      .join(" ");
  const strongest = points.reduce<RouteWeatherPoint | undefined>(
    (best, p) => (!best || p.wind.gusts > best.wind.gusts ? p : best),
    undefined,
  );
  const arrowStep = Math.max(1, Math.ceil(points.length / MAX_ARROWS));
  const arrows = points.filter((_, i) => i % arrowStep === 0);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!onHoverKm) return;
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onHoverKm(f * length);
  };
  const info =
    hoverKm === undefined
      ? undefined
      : points.reduce((best, p) =>
          Math.abs(p.km - hoverKm) < Math.abs(best.km - hoverKm) ? p : best,
        );

  const dayLines = (height: number) =>
    breaks.map((km) => (
      <line
        key={km}
        x1={x(km)}
        x2={x(km)}
        y1={0}
        y2={height}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="stroke-text opacity-40"
      />
    ));
  const crosshair = (height: number) =>
    hoverKm !== undefined && (
      <line
        x1={x(hoverKm)}
        x2={x(hoverKm)}
        y1={0}
        y2={height}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="stroke-text-muted"
      />
    );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ChartToolbar
        start={
          summary && (
            <span className="truncate text-text-muted tabular-nums">
              {summary}
            </span>
          )
        }
      />

      <ChartBody className="gap-1 pr-12 pl-14">
        <div aria-hidden className="relative h-4">
          {breaks.map((km, i) => (
            <span
              key={km}
              className="absolute top-0 flex size-4 -translate-x-1/2 items-center justify-center rounded-full bg-marker text-2xs leading-none font-extrabold text-surface"
              style={{ left: pct(km) }}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <div
          className="relative flex touch-none flex-col gap-1.5"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={onHoverKm && (() => onHoverKm(undefined))}
        >
          <div className="relative h-12">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 block size-full overflow-visible"
              role="img"
              aria-label={t("tripWeather.label")}
            >
              {days.flatMap((d) =>
                d.slice(0, -1).map((p, i) => {
                  const next = d[i + 1];
                  if (!next || p.rain <= 0) return null;
                  const width = x(next.km) - x(p.km);
                  return (
                    <rect
                      key={p.km}
                      x={x(p.km) + width * 0.1}
                      width={width * 0.8}
                      y={rainY(p.rain)}
                      height={H - rainY(p.rain)}
                      rx={2}
                      className="fill-rain"
                      fillOpacity={0.3 + 0.6 * p.rainChance}
                    />
                  );
                }),
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
              {dayLines(H)}
              <path
                d={path((p) => ty(p.feelsLike))}
                fill="none"
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-text-muted"
              />
              {crosshair(H)}
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
              aria-label={t("tripWeather.windSpeedLabel")}
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
              {dayLines(WIND_H)}
              <path
                d={path((p) => wy(p.wind.gusts))}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-wind-speed-2"
              />
              <path
                d={path((p) => wy(p.wind.speed))}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-wind-speed-3"
              />
              {crosshair(WIND_H)}
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
                  left: pct(strongest.km),
                  top: `${windPct(strongest.wind.gusts)}%`,
                }}
              >
                {format.speed(strongest.wind.gusts)}
              </span>
            )}
          </div>

          <ul
            className="relative h-3.5"
            aria-label={t("tripWeather.windLabel")}
          >
            {arrows.map((p) => (
              <li
                key={p.km}
                className={cn(
                  "absolute -translate-x-1/2",
                  windColor[p.wind.kind],
                )}
                style={{ left: pct(p.km) }}
              >
                <ArrowUp
                  className="size-3.5"
                  style={{ transform: `rotate(${p.wind.rotation}deg)` }}
                  role="img"
                  aria-label={t(`weather.wind.${p.wind.kind}`)}
                />
              </li>
            ))}
          </ul>
        </div>

        <div
          aria-hidden
          className="relative mt-auto h-4 text-2xs text-text-muted tabular-nums"
        >
          {kmTicks.map((k) => (
            <span
              key={k}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: pct(k) }}
            >
              {format.distance(k * 1000)}
            </span>
          ))}
        </div>
      </ChartBody>

      <ChartInfo>
        {info && (
          <dl className="flex items-center gap-x-4 [&_dd]:text-text [&_svg]:size-3.5 [&>div]:flex [&>div]:items-center [&>div]:gap-1.5">
            {describe && (
              <div>
                <dt className="sr-only">{t("tripWeather.where")}</dt>
                <dd className="font-semibold">{describe(info)}</dd>
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
          </dl>
        )}
      </ChartInfo>
    </div>
  );
}

function geometry<P extends RouteWeatherPoint>(points: P[]) {
  const last = points.at(-1);
  if (points.length < 2 || !last || last.km <= 0) return undefined;
  const length = last.km;
  const x = (km: number) => (km / length) * W;
  const days: P[][] = [];
  for (const p of points) {
    const current = days.at(-1);
    if (current && current[0]?.day === p.day) current.push(p);
    else days.push([p]);
  }
  const breaks = days.slice(1).map((d) => d[0]?.km ?? 0);
  const kmStep = niceStep(length, 5, [1, 2, 5, 10]);
  const kmTicks: number[] = [];
  for (let k = kmStep; k < length - kmStep / 3; k += kmStep) kmTicks.push(k);
  return { length, x, days, breaks, kmTicks };
}
