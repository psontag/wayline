import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../format";
import { cn } from "../lib/cn";
import { Button, focusRing } from "./Button";

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
};

export type StopChoicesProps = {
  choices: StopChoice[];
  /** Picks a choice to preview. Undefined deselects it. */
  onSelect?: (id: string | undefined) => void;
  /** The choice being previewed. It shows what changes and asks to confirm. */
  selectedId?: string;
  onConfirm?: (id: string) => void;
  disabled?: boolean;
  /**
   * Radius for the hotel count, in meters. Without it there is no next day
   * and no hotel, e.g. at the end of a trip.
   */
  hotelsRadius?: number;
};

/** The stop and its alternatives, with what each changes. */
export function StopChoices({
  choices,
  onSelect,
  selectedId,
  onConfirm,
  disabled = false,
  hotelsRadius,
}: StopChoicesProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const cell = "px-1.5 py-1.5 text-right whitespace-nowrap";
  const now = choices.find((c) => c.current);
  const picked = choices.find((c) => c.id === selectedId && !c.current);
  const signed = (value: number, text: string) =>
    t(value < 0 ? "stopChoices.less" : "stopChoices.more", { value: text });

  return (
    <div className="flex w-full flex-col gap-1.5">
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr className="text-2xs text-text-muted">
            <th className="px-1.5 pb-1 text-left font-semibold">
              {t("stopChoices.stop")}
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
            const isPicked = c.id === picked?.id;
            const pick =
              c.current || disabled || !onSelect
                ? undefined
                : () => onSelect(isPicked ? undefined : c.id);
            return (
              <tr
                key={c.id}
                aria-current={c.current || undefined}
                onClick={pick}
                className={cn(
                  "[&>td:first-child]:rounded-l-sm [&>td:last-child]:rounded-r-sm",
                  c.current
                    ? "bg-selected font-bold"
                    : isPicked
                      ? "cursor-pointer bg-hover outline-2 -outline-offset-2 outline-selected-border"
                      : pick && "cursor-pointer hover:bg-hover",
                )}
              >
                <td className="w-full max-w-0 px-1.5 py-1.5 text-left">
                  <div className="flex items-center gap-1">
                    {c.current ? (
                      <Check className="size-3.5 shrink-0" aria-hidden />
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
                          aria-label={t("stopChoices.choose", {
                            name: c.name,
                          })}
                          aria-pressed={isPicked}
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
                      {c.size && (
                        <span className="text-2xs font-normal text-text-muted">
                          {t(`stopChoices.size.${c.size}`)}
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
      {picked && now && (
        <div className="flex flex-col gap-2 rounded-md border border-selected-border bg-selected p-2.5">
          <p className="text-xs tabular-nums">
            <span className="font-bold">
              {t("stopChoices.preview", { name: picked.name })}
            </span>{" "}
            {t("stopChoices.delta", {
              distance: signed(
                picked.distance - now.distance,
                format.distance(Math.abs(picked.distance - now.distance)),
              ),
              ascent: signed(
                picked.ascent - now.ascent,
                format.elevation(Math.abs(picked.ascent - now.ascent)),
              ),
            })}
            {picked.nextDistance !== undefined &&
              now.nextDistance !== undefined && (
                <>
                  {" · "}
                  {t("stopChoices.nextDelta", {
                    distance: format.distance(picked.nextDistance),
                    change: signed(
                      picked.nextDistance - now.nextDistance,
                      format.distance(
                        Math.abs(picked.nextDistance - now.nextDistance),
                      ),
                    ),
                  })}
                </>
              )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={disabled}
              onClick={() => onConfirm?.(picked.id)}
            >
              {t("stopChoices.confirm", { name: picked.name })}
            </Button>
            <Button size="sm" onClick={() => onSelect?.(undefined)}>
              {t("stopChoices.cancel")}
            </Button>
          </div>
        </div>
      )}
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
