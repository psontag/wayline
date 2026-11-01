import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

/** Framed list of rows, e.g. NavRow or ChoiceList rows. */
export function RowList({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
      {children}
    </div>
  );
}

export type NavRowProps = {
  title: string;
  /** Muted second line. */
  detail?: ReactNode;
  onClick: () => void;
};

/** Row that opens the next level of a panel. Sits in a RowList. */
export function NavRow({ title, detail, onClick }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-hover",
        focusRing,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold">{title}</span>
        {detail && (
          <span className="truncate text-xs text-text-muted">{detail}</span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}

/** Last row of a framed list that shows more or fewer rows. */
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
