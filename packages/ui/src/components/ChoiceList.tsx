import * as RadioGroup from "@radix-ui/react-radio-group";
import { ChevronDown } from "lucide-react";
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
  /** Less fitting, e.g. rain on the dates. The title is muted. */
  muted?: boolean;
};

export type ChoiceListProps = {
  options: ChoiceOption[];
  value?: string;
  onValueChange?: (id: string) => void;
  disabled?: boolean;
  "aria-label": string;
  /** Last row, e.g. a button to show more. */
  footer?: ReactNode;
  /** The row under the pointer, to highlight it on the map. */
  onHoverChange?: (id: string | undefined) => void;
};

/** Pick one of several, in a framed list. The current row is highlighted. */
export function ChoiceList({
  options,
  value,
  onValueChange,
  disabled,
  "aria-label": label,
  footer,
  onHoverChange,
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
          onPointerEnter={onHoverChange && (() => onHoverChange(o.id))}
          onPointerLeave={onHoverChange && (() => onHoverChange(undefined))}
          className={cn(
            "flex items-center gap-1 pr-2",
            o.id === value
              ? "ring-2 ring-selected-border ring-inset"
              : "hover:bg-hover",
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
              <span
                className={cn(
                  "truncate text-sm font-bold",
                  o.muted && "text-text-muted",
                )}
              >
                {o.title}
              </span>
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

/** Last row of a ChoiceList that shows more or fewer rows. */
export function MoreRow({
  label,
  expanded,
  onClick,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 bg-bg px-3 py-2 text-left text-xs font-semibold text-text-muted hover:bg-hover",
        focusRing,
      )}
    >
      <span className="flex-1">{label}</span>
      <ChevronDown
        className={cn("size-4 transition-transform", expanded && "rotate-180")}
        aria-hidden
      />
    </button>
  );
}
