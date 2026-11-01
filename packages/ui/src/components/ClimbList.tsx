import { ChevronDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";

export type ClimbItem = {
  startKm: number;
  endKm: number;
  /** m */
  gain: number;
  /** Average grade in %. */
  grade: number;
  /** Steepest 100 m in %. */
  maxGrade: number;
};

export type ClimbListProps = {
  climbs: ClimbItem[];
  /** Called with the climb under the pointer, or undefined. */
  onHoverClimb?: (index: number | undefined) => void;
  /** Climb to show stronger, e.g. the one under the chart crosshair. */
  highlighted?: number;
};

/** One line with the number of climbs and the longest. Opens to a list. */
export function ClimbList({
  climbs,
  onHoverClimb,
  highlighted,
}: ClimbListProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const length = (c: ClimbItem) => c.endKm - c.startKm;
  const grade = (g: number) => format.percent(g / 100);
  const longest = climbs.reduce<ClimbItem | undefined>(
    (best, c) => (!best || length(c) > length(best) ? c : best),
    undefined,
  );

  if (!longest) {
    return (
      <span className="flex items-center gap-2 text-sm text-text-muted">
        <TrendingUp className="size-4 shrink-0" aria-hidden />
        {t("climbs.none")}
      </span>
    );
  }
  return (
    <details className="group text-sm">
      <summary
        className={cn(
          "-mx-1 flex cursor-pointer list-none items-center gap-2 rounded-sm px-1 hover:text-text-muted",
          // Closed, the summary stands in for the highlighted row.
          highlighted !== undefined && "bg-hover group-open:bg-transparent",
        )}
      >
        <TrendingUp className="size-4 shrink-0 text-text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          {t("climbs.summary", {
            count: climbs.length,
            length: format.shortDistance(length(longest) * 1000),
            grade: grade(longest.grade),
          })}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <ol className="mt-2 flex flex-col gap-1 tabular-nums">
        {climbs.map((c, i) => (
          <li
            key={c.startKm}
            onMouseEnter={() => onHoverClimb?.(i)}
            onMouseLeave={() => onHoverClimb?.(undefined)}
            className={cn(
              "-mx-1 grid grid-cols-4 gap-2 rounded-sm px-1 text-xs hover:bg-hover",
              i === highlighted && "bg-hover",
            )}
          >
            <span className="text-text-muted">
              {t("climbs.at", { km: format.distance(c.startKm * 1000) })}
            </span>
            <span>{format.shortDistance(length(c) * 1000)}</span>
            <span>
              {t("climbs.grade", {
                grade: grade(c.grade),
                max: grade(c.maxGrade),
              })}
            </span>
            <span className="text-right text-text-muted">
              {t("climbs.gain", { gain: format.elevation(c.gain) })}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
