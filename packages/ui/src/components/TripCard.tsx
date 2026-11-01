import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type TripCardProps = {
  /** The trip name as a link. The whole card is clickable through it. */
  title: ReactNode;
  badge?: ReactNode;
  dates: string;
  /** Usually a row of `Stat`s. */
  stats: ReactNode;
  /** Extra line at the bottom, e.g. who shared the trip. */
  byline?: ReactNode;
  /** Line of the trip as [lon, lat] points. */
  preview: [number, number][];
  /** Image of the map under the line, fitted like `thumbnailFit`. */
  map?: string;
  /** Buttons in the top right corner, e.g. a menu. */
  actions?: ReactNode;
};

/** A trip in the trip list: a route thumbnail with name, dates and stats. */
export function TripCard({
  title,
  badge,
  dates,
  stats,
  byline,
  preview,
  map,
  actions,
}: TripCardProps) {
  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-text transition-colors hover:border-text-muted",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus-ring",
      )}
    >
      <RouteThumbnail points={preview} map={map} />
      <div className="flex flex-col gap-1 p-3.5 md:gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-md font-extrabold [&_a]:outline-none [&_a]:after:absolute [&_a]:after:inset-0">
            {title}
          </span>
          {badge}
        </div>
        <span className="text-sm text-text-muted">{dates}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
          {stats}
        </span>
        {byline && (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted [&_svg]:size-3.5 [&_svg]:shrink-0">
            {byline}
          </span>
        )}
      </div>
      {actions && (
        <div className="absolute top-2 right-2 rounded-sm bg-surface shadow-sm">
          {actions}
        </div>
      )}
    </article>
  );
}

/** Size of the thumbnail and the room around the line, in pixels. */
export const thumbnailFit = { width: 300, height: 100, padding: 18 };
const { width: WIDTH, height: HEIGHT, padding: PAD } = thumbnailFit;

function RouteThumbnail({
  points,
  map,
}: {
  points: [number, number][];
  map?: string;
}) {
  const path = thumbnailPath(points);
  const first = path.points[0];
  const last = path.points.at(-1);
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="block aspect-7/2 w-full bg-hover md:aspect-3/1"
    >
      {map && <image href={map} width={WIDTH} height={HEIGHT} />}
      <path
        d={path.d}
        fill="none"
        className="stroke-route-casing"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={path.d}
        fill="none"
        className="stroke-route"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[first, last].map(
        (p, i) =>
          p && (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r="4"
              className="fill-marker stroke-surface"
              strokeWidth="2"
            />
          ),
      )}
    </svg>
  );
}

/**
 * Fits the line into the thumbnail, north up. Web Mercator, so it lines up
 * with a map fitted to the same points.
 */
export function thumbnailPath(points: [number, number][]) {
  if (points.length === 0) return { d: "", points: [] };
  const xy = points.map(
    ([lon, lat]) =>
      [
        lon,
        -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) *
          (180 / Math.PI),
      ] as const,
  );
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(
    (WIDTH - 2 * PAD) / (maxX - minX || 1),
    (HEIGHT - 2 * PAD) / (maxY - minY || 1),
  );
  const offX = (WIDTH - (maxX - minX) * scale) / 2;
  const offY = (HEIGHT - (maxY - minY) * scale) / 2;
  const out = xy.map(
    ([x, y]) =>
      [round(offX + (x - minX) * scale), round(offY + (y - minY) * scale)] as [
        number,
        number,
      ],
  );
  const d = out.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");
  return { d, points: out };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
