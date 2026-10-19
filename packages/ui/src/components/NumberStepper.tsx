import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type NumberStepperProps = {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Whole number with minus and plus buttons, e.g. the number of days. */
export function NumberStepper({
  value,
  onValueChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  ...props
}: NumberStepperProps) {
  const { t } = useTranslation("ui");
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const button = cn(
    "flex w-10 shrink-0 items-center justify-center bg-bg text-text transition-colors",
    "hover:bg-hover active:bg-active disabled:opacity-50 [&_svg]:size-4",
    focusRing,
    "focus-visible:-outline-offset-2",
  );

  return (
    <div className="flex h-10 overflow-hidden rounded-sm border border-border bg-surface">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("stepper.decrease")}
        disabled={value !== undefined && value <= min}
        onClick={() => onValueChange(clamp((value ?? min) - step))}
        className={cn(button, "border-r border-border")}
      >
        <Minus aria-hidden />
      </button>
      <input
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => onValueChange(parseWhole(e.target.value))}
        onBlur={() => value !== undefined && onValueChange(clamp(value))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") onValueChange(clamp((value ?? min) + step));
          else if (e.key === "ArrowDown")
            onValueChange(clamp((value ?? min) - step));
          else return;
          e.preventDefault();
        }}
        className={cn(
          "min-w-0 flex-1 bg-surface text-center text-base font-bold text-text tabular-nums",
          focusRing,
          "focus-visible:-outline-offset-2",
        )}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("stepper.increase")}
        disabled={value !== undefined && value >= max}
        onClick={() => onValueChange(clamp((value ?? min) + step))}
        className={cn(button, "border-l border-border")}
      >
        <Plus aria-hidden />
      </button>
    </div>
  );
}

/** Digits only. Empty input is undefined. */
export function parseWhole(text: string): number | undefined {
  const digits = text.replace(/\D/g, "");
  return digits === "" ? undefined : Number(digits);
}
