import { cn } from "../lib/cn";
import { parseWhole } from "./NumberStepper";

export type NumberInputProps = {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  /** Shown after the number, e.g. "km". */
  unit?: string;
  id?: string;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Whole number with a unit, e.g. km per day. */
export function NumberInput({
  value,
  onValueChange,
  unit,
  ...props
}: NumberInputProps) {
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 text-base text-text",
        "transition-colors hover:border-text-muted",
        "has-focus-visible:outline-2 has-focus-visible:outline-focus-ring has-aria-invalid:border-danger",
      )}
    >
      <input
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => onValueChange(parseWhole(e.target.value))}
        className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
        {...props}
      />
      {unit && <span className="text-text-muted">{unit}</span>}
    </div>
  );
}
