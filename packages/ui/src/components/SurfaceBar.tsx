import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";

export type SurfaceShares = {
  paved: number;
  gravel: number;
  unpaved: number;
};

const segments = [
  { key: "paved", color: "bg-terrain-paved" },
  { key: "gravel", color: "bg-terrain-gravel" },
  { key: "unpaved", color: "bg-terrain-unpaved" },
  { key: "unknown", color: "bg-terrain-unknown" },
] as const;

/**
 * Thin bar with the paved, gravel and unpaved shares of a route. Shares that
 * add up to less than 1 leave the rest as unknown, e.g. on imported routes.
 */
export function SurfaceBar({
  shares,
  caption = false,
  className,
}: {
  shares: SurfaceShares;
  /** Show the shares as text below, e.g. "97% paved · 2% gravel". */
  caption?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const known = shares.paved + shares.gravel + shares.unpaved;
  const total = Math.max(known, 1);
  const all = { ...shares, unknown: total - known };
  const percent = (value: number) => format.percent(value / total);
  const parts = segments
    // Shares below half a percent would read as "0%".
    .filter(({ key }) => all[key] / total >= 0.005)
    .map(({ key }) => t(`surface.share.${key}`, { share: percent(all[key]) }));

  const bar = (
    <div
      role="img"
      aria-label={t("surface.summary", { parts: parts.join(", ") })}
      className={cn(
        "flex h-1.5 gap-0.5 overflow-hidden rounded-full",
        !caption && className,
      )}
    >
      {segments.map(({ key, color }) =>
        all[key] > 0 ? (
          <div key={key} className={color} style={{ flexGrow: all[key] }} />
        ) : null,
      )}
    </div>
  );
  if (!caption) return bar;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {bar}
      <span aria-hidden className="text-2xs text-text-muted tabular-nums">
        {parts.join(" · ")}
      </span>
    </div>
  );
}

/** Color key for the surface colors. Unknown only when the route has some. */
export function SurfaceLegend({ unknown = false }: { unknown?: boolean }) {
  const { t } = useTranslation("ui");
  return (
    <div className="flex items-center gap-3.5 text-xs text-text-muted">
      {segments
        .filter(({ key }) => unknown || key !== "unknown")
        .map(({ key, color }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={cn("h-1 w-3 rounded-full", color)} />
            {t(`surface.${key}`)}
          </span>
        ))}
    </div>
  );
}
