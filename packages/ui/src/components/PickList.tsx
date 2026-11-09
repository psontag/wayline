import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type PickOption = {
  id: string;
  title: string;
  /** Muted second line. */
  detail?: ReactNode;
  /** At the end of the row, e.g. a train time. */
  end?: ReactNode;
};

export type PickListProps = {
  options: PickOption[];
  onPick: (id: string) => void;
  "aria-label": string;
  /** Last row, e.g. a MoreRow. */
  footer?: ReactNode;
  /** The row under the pointer, to highlight it on the map. */
  onHoverChange?: (id: string | undefined) => void;
};

/** Framed list of rows that each do something, e.g. open an area. */
export function PickList({
  options,
  onPick,
  "aria-label": label,
  footer,
  onHoverChange,
}: PickListProps) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
      <ul aria-label={label} className="flex flex-col divide-y divide-border">
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onPick(o.id)}
              onPointerEnter={onHoverChange && (() => onHoverChange(o.id))}
              onPointerLeave={onHoverChange && (() => onHoverChange(undefined))}
              onFocus={onHoverChange && (() => onHoverChange(o.id))}
              onBlur={onHoverChange && (() => onHoverChange(undefined))}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover",
                focusRing,
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold text-text">
                  {o.title}
                </span>
                {o.detail && (
                  <span className="truncate text-xs text-text-muted tabular-nums">
                    {o.detail}
                  </span>
                )}
              </span>
              {o.end}
            </button>
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}
