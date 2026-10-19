import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** Radio group of ChoiceCards. The legend is for screen readers only. */
export function ChoiceGroup({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}

export type ChoiceCardProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title: string;
  /** Muted line under the title. */
  meta?: string;
  /** Short note at the end, e.g. "Current". */
  note?: string;
};

/** Large radio option with a title, a meta line and a note. */
export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  disabled,
  title,
  meta,
  note,
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring",
        "has-disabled:cursor-default has-disabled:opacity-50",
        checked
          ? "border-selected-border bg-selected"
          : "border-border bg-surface hover:bg-hover",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="m-0 size-4 shrink-0 accent-selected-border outline-none"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{title}</span>
        {meta && (
          <span className="truncate text-xs text-text-muted tabular-nums">
            {meta}
          </span>
        )}
      </span>
      {note && (
        <span className="shrink-0 text-xs font-bold text-text-muted">
          {note}
        </span>
      )}
    </label>
  );
}
