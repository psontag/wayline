import { Check } from "lucide-react";
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
  /** Hotels near the stop. inBudget only when the trip has a budget. */
  beds?: { total: number; inBudget?: number };
  size?: "village" | "town" | "city";
};

export type StopChoicesProps = {
  choices: StopChoice[];
  onSelect?: (id: string) => void;
  disabled?: boolean;
  /** Radius for the beds count, in meters. */
  bedsRadius: number;
};

/** The stop and its alternatives, with what each changes. */
export function StopChoices({
  choices,
  onSelect,
  disabled = false,
  bedsRadius,
}: StopChoicesProps) {
  const { t } = useTranslation("ui");
  const format = useFormat();
  const withBudget = choices.some((c) => c.beds?.inBudget !== undefined);
  const cell = "px-1.5 py-1.5 text-right";

  return (
    <div className="flex w-full flex-col gap-1.5">
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr className="text-2xs text-text-muted">
            <th className="px-1.5 pb-1 text-left font-semibold">
              {t("stopChoices.stop")}
            </th>
            <th className="px-1.5 pb-1 text-right font-semibold">
              {t("stopChoices.today")}
            </th>
            <th className="px-1.5 pb-1 text-right font-semibold">
              {t("stopChoices.ascent")}
            </th>
            <th className="px-1.5 pb-1 text-right font-semibold">
              {t("stopChoices.tomorrow")}
            </th>
            <th className="px-1.5 pb-1 text-right font-semibold">
              {t("stopChoices.beds")}
            </th>
          </tr>
        </thead>
        <tbody>
          {choices.map((c) => {
            const pick =
              c.current || disabled || !onSelect
                ? undefined
                : () => onSelect(c.id);
            return (
              <tr
                key={c.id}
                aria-current={c.current || undefined}
                onClick={pick}
                className={cn(
                  "[&>td:first-child]:rounded-l-sm [&>td:last-child]:rounded-r-sm",
                  c.current
                    ? "bg-selected font-bold"
                    : pick && "cursor-pointer hover:bg-hover",
                )}
              >
                <td className="max-w-0 px-1.5 py-1.5 text-left">
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
                <td className={cell}>
                  {c.nextDistance === undefined
                    ? t("stopChoices.none")
                    : format.distance(c.nextDistance)}
                </td>
                <td className={cell}>
                  {!c.beds
                    ? t("stopChoices.none")
                    : c.beds.inBudget === undefined
                      ? c.beds.total
                      : t("stopChoices.bedsInBudget", {
                          inBudget: c.beds.inBudget,
                          total: c.beds.total,
                        })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-1.5 text-2xs text-text-muted">
        {t(withBudget ? "stopChoices.bedsNoteBudget" : "stopChoices.bedsNote", {
          radius: format.distance(bedsRadius),
        })}
      </p>
    </div>
  );
}
