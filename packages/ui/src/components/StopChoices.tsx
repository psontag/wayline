import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type StopChoice = {
  id: string;
  name: string;
  current: boolean;
  /** Meters, this stage if it ended here. */
  distance: number;
  /** Meters, this stage if it ended here. */
  ascent: number;
  /** Meters, the next stage. Missing on the last stage. */
  nextDistance?: number;
  /** Hotels near the stop. Missing while unknown. */
  hotels?: number;
  size?: "village" | "town" | "city";
  /**
   * Another way to the same stop, not another stop: its number, for the
   * swatch in the color of its map line.
   */
  way?: number;
  /** Second line, e.g. what a way is like. Without it, the town size. */
  detail?: string;
};

/**
 * Swatches of the ways, the same as their lines on the map. Not route-1 or
 * route-4: they look like the day colors.
 */
const WAY_SWATCH = ["bg-route-2", "bg-route-3", "bg-route-5"] as const;

export type StopChoicesProps = {
  choices: StopChoice[];
  /** Under the table, e.g. a button to find more choices. */
  footer?: ReactNode;
  onSelect?: (id: string) => void;
  /** The choice under the pointer or in focus, e.g. to preview it. */
  onHover?: (id: string | undefined) => void;
  /** Shows a choice as hovered, e.g. while its map marker is. */
  hoveredId?: string;
  disabled?: boolean;
  /**
   * Radius for the hotel count, in meters. Without it there is no next day
   * and no hotel, e.g. at the end of a trip.
   */
  hotelsRadius?: number;
};

/** The stop, other stops and other ways, with what each changes. */
export function StopChoices({
  choices,
  footer,
  onSelect,
  onHover,
  hoveredId,
  disabled = false,
  hotelsRadius,
}: StopChoicesProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const cell = "px-1.5 py-1.5 text-right whitespace-nowrap";
  const withWays = choices.some((c) => c.way !== undefined);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr className="text-2xs text-text-muted">
            <th className="px-1.5 pb-1 text-left font-semibold">
              {t(withWays ? "stopChoices.choice" : "stopChoices.stop")}
            </th>
            <th className="px-1.5 pb-1 text-right font-semibold whitespace-nowrap">
              {t("stopChoices.today")}
            </th>
            <th className="px-1.5 pb-1 text-right font-semibold whitespace-nowrap">
              {t("stopChoices.ascent")}
            </th>
            {hotelsRadius !== undefined && (
              <>
                <th className="px-1.5 pb-1 text-right font-semibold whitespace-nowrap">
                  {t("stopChoices.tomorrow")}
                </th>
                <th className="px-1.5 pb-1 text-right font-semibold whitespace-nowrap">
                  {t("stopChoices.hotels")}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {choices.map((c) => {
            const pick =
              c.current || disabled || !onSelect
                ? undefined
                : () => onSelect(c.id);
            const hover = (on: boolean) =>
              !c.current && onHover?.(on ? c.id : undefined);
            return (
              <tr
                key={c.id}
                aria-current={c.current || undefined}
                onClick={pick}
                onMouseEnter={() => hover(true)}
                onMouseLeave={() => hover(false)}
                className={cn(
                  "[&>td:first-child]:rounded-l-sm [&>td:last-child]:rounded-r-sm",
                  c.current
                    ? "bg-selected font-bold"
                    : pick && "cursor-pointer hover:bg-hover",
                  !c.current && c.id === hoveredId && "bg-hover",
                )}
              >
                <td className="w-full max-w-0 px-1.5 py-1.5 text-left">
                  <div className="flex items-center gap-1">
                    {c.current ? (
                      <Check className="size-3.5 shrink-0" aria-hidden />
                    ) : c.way !== undefined ? (
                      <span className="flex size-3.5 shrink-0 items-center justify-center">
                        <span
                          className={cn(
                            "size-2.5 rounded-sm",
                            WAY_SWATCH[c.way % WAY_SWATCH.length],
                          )}
                        />
                      </span>
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <div className="flex min-w-0 flex-col">
                      {pick ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            pick();
                          }}
                          onFocus={() => hover(true)}
                          onBlur={() => hover(false)}
                          aria-label={t(
                            c.way === undefined
                              ? "stopChoices.choose"
                              : "stopChoices.ride",
                            { name: c.name },
                          )}
                          className={cn(
                            "truncate rounded-sm text-left font-semibold",
                            focusRing,
                          )}
                        >
                          {c.name}
                        </button>
                      ) : (
                        <span className="truncate">{c.name}</span>
                      )}
                      {(c.detail || c.size) && (
                        <span className="truncate text-2xs font-normal text-text-muted">
                          {c.detail ||
                            (c.size && t(`stopChoices.size.${c.size}`))}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className={cell}>{format.distance(c.distance)}</td>
                <td className={cell}>{format.elevation(c.ascent)}</td>
                {hotelsRadius !== undefined && (
                  <>
                    <td className={cell}>
                      {c.nextDistance === undefined
                        ? t("stopChoices.none")
                        : format.distance(c.nextDistance)}
                    </td>
                    <td className={cell}>
                      {c.hotels ?? t("stopChoices.none")}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer}
      {hotelsRadius !== undefined && (
        <p className="px-1.5 text-2xs text-text-muted">
          {t("stopChoices.hotelsNote", {
            radius: format.distance(hotelsRadius),
          })}
        </p>
      )}
    </div>
  );
}
