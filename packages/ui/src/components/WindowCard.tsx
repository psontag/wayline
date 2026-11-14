import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

/**
 * A suggestion with a click target on top and more actions below, e.g. a
 * trip window with its best areas.
 */
export function WindowCard({
  title,
  detail,
  note,
  selected = false,
  onPick,
  children,
}: {
  title: string;
  /** At the end of the top row, e.g. "12 dry areas". */
  detail?: string;
  /** Muted line at the bottom, e.g. why it may change. */
  note?: string;
  selected?: boolean;
  onPick: () => void;
  /** Actions under the title, e.g. chips. */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-2.5 py-2",
        selected
          ? "border-selected-border bg-selected"
          : "border-border bg-surface",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onPick}
        className={cn(
          "flex items-baseline justify-between gap-2 rounded-sm text-left",
          focusRing,
        )}
      >
        <span className="text-sm font-bold text-text">{title}</span>
        {detail && (
          <span className="text-xs text-text-muted tabular-nums">{detail}</span>
        )}
      </button>
      {children}
      {note && <span className="text-xs text-text-muted">{note}</span>}
    </div>
  );
}
