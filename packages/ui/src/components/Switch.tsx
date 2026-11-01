import { useId } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
};

/** One setting on or off, with its label, e.g. planning with the wind. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  hint,
  className,
}: SwitchProps) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-bold">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-xs text-text-muted">
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-active",
          focusRing,
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-sm transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}
