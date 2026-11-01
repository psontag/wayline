import * as RadioGroup from "@radix-ui/react-radio-group";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { Badge } from "./Chip";

export type ChoiceOption = {
  id: string;
  title: string;
  /** Muted second line. */
  detail?: ReactNode;
  /** Short label, e.g. "Least headwind". */
  tag?: string;
  /** Actions at the end of the row, e.g. links or a save button. */
  end?: ReactNode;
};

export type ChoiceListProps = {
  options: ChoiceOption[];
  value?: string;
  onValueChange?: (id: string) => void;
  disabled?: boolean;
  "aria-label": string;
  /** Last row, e.g. a button to show more. */
  footer?: ReactNode;
};

/** Pick one of several, in a framed list. The current row is highlighted. */
export function ChoiceList({
  options,
  value,
  onValueChange,
  disabled,
  "aria-label": label,
  footer,
}: ChoiceListProps) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || !onValueChange}
      aria-label={label}
      className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border"
    >
      {options.map((o) => (
        <div
          key={o.id}
          className={cn(
            "flex items-center gap-1 pr-2",
            o.id === value ? "bg-selected" : "hover:bg-hover",
          )}
        >
          <RadioGroup.Item
            value={o.id}
            className={cn(
              "group flex min-w-0 flex-1 items-center gap-2.5 rounded-sm py-2 pl-3 text-left disabled:cursor-default",
              focusRing,
            )}
          >
            <span className="size-3.5 shrink-0 rounded-full border border-text-muted group-data-[state=checked]:border-4 group-data-[state=checked]:border-selected-border" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold">{o.title}</span>
              {o.detail && (
                <span className="flex flex-wrap items-center gap-x-3 text-xs text-text-muted tabular-nums">
                  {o.detail}
                </span>
              )}
            </span>
            {o.tag && <Badge>{o.tag}</Badge>}
          </RadioGroup.Item>
          {o.end}
        </div>
      ))}
      {footer}
    </RadioGroup.Root>
  );
}
