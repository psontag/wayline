import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Panel under a map with views that switch, e.g. elevation and weather.
 * Every view has the same rows, so switching moves nothing: a toolbar,
 * the chart and an info line, each with a fixed height.
 */
export function ChartPanel({
  title,
  tabs,
  children,
}: {
  title: ReactNode;
  /** The view switcher. It stays in place in every view. */
  tabs?: ReactNode;
  /** The view: ChartToolbar, ChartBody and ChartInfo. */
  children: ReactNode;
}) {
  return (
    <section className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-4 py-3">
      <div className="flex h-8 items-center justify-between gap-3">
        <h2 className="min-w-0 truncate font-bold">{title}</h2>
        {tabs}
      </div>
      {children}
    </section>
  );
}

/** Row above the chart. Start and end content, one line. */
export function ChartToolbar({
  start,
  end,
}: {
  start?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">{start}</div>
      {end && <div className="flex shrink-0 items-center gap-2">{end}</div>}
    </div>
  );
}

/** The chart. Its height is the same in every view. */
export function ChartBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-chart flex-col", className)}>{children}</div>
  );
}

/** Line below the chart for the values under the pointer. */
export function ChartInfo({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-5 items-center gap-x-4 overflow-hidden text-xs whitespace-nowrap text-text-muted tabular-nums">
      {children}
    </div>
  );
}
