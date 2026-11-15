import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

/**
 * Swatches for up to three routes, the same as their lines on the map. Not
 * route-1 or route-4: they look like the day colors.
 */
const SWATCH = ["bg-route-2", "bg-route-3", "bg-route-5"] as const;

export type RouteChoice = {
  id: string;
  /** E.g. "Scenic · via Ebern". */
  title: string;
  /** What the route is like, e.g. "Quiet · Gravel". */
  detail?: string;
  /** Meters. */
  distance: number;
  /** Meters. */
  ascent: number;
  /** Meters, against the current route. */
  change: number;
};

export type RouteChoicesProps = {
  choices: RouteChoice[];
  onSelect?: (id: string) => void;
  /** The choice under the pointer or in focus, e.g. to show it on the map. */
  onHover?: (id: string | undefined) => void;
  hoveredId?: string;
  disabled?: boolean;
};

/** Other routes for a day, in the colors of their map lines. A click picks one. */
export function RouteChoices({
  choices,
  onSelect,
  onHover,
  hoveredId,
  disabled = false,
}: RouteChoicesProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  return (
    <ul className="flex flex-col gap-1">
      {choices.map((c, i) => (
        <li key={c.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(c.id)}
            onMouseEnter={() => onHover?.(c.id)}
            onMouseLeave={() => onHover?.(undefined)}
            onFocus={() => onHover?.(c.id)}
            onBlur={() => onHover?.(undefined)}
            aria-label={t("routeChoices.choose", { name: c.title })}
            className={cn(
              "flex w-full items-start gap-2 rounded-sm px-1.5 py-1.5 text-left text-xs hover:bg-hover disabled:pointer-events-none disabled:opacity-60",
              c.id === hoveredId && "bg-hover",
              focusRing,
            )}
          >
            <span
              className={cn(
                "mt-1 size-2.5 shrink-0 rounded-sm",
                SWATCH[i % SWATCH.length],
              )}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{c.title}</span>
              {c.detail && (
                <span className="truncate text-2xs text-text-muted">
                  {c.detail}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end tabular-nums">
              <span>
                {format.distance(c.distance)} · {format.elevation(c.ascent)}
              </span>
              <span className="text-2xs text-text-muted">
                {t(c.change < 0 ? "routeChoices.less" : "routeChoices.more", {
                  value: format.distance(Math.abs(c.change)),
                })}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
