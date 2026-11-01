import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { type DayColor, dayColorClasses } from "./DayList";

export type PanelHeaderProps = {
  /** Row above the title: back button and switches to the next items. */
  nav?: ReactNode;
  /** Small line above the title, e.g. the date. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Next to the title, e.g. the trip menu. */
  actions?: ReactNode;
  /** Key stats under the title. */
  stats?: ReactNode;
  /** E.g. Changed with Revert. */
  notice?: ReactNode;
  /** Bar left of the title, e.g. the stage color. */
  color?: DayColor;
};

/** Top of a side panel. Names the level the panel shows. */
export function PanelHeader({
  nav,
  eyebrow,
  title,
  actions,
  stats,
  notice,
  color,
}: PanelHeaderProps) {
  return (
    <>
      {/* Stays at the top while the panel scrolls. */}
      {nav && (
        <div className="sticky top-0 z-panel flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
          {nav}
        </div>
      )}
      <header className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          {color && (
            <span
              className={cn(
                "w-1.5 shrink-0 self-stretch rounded-full",
                dayColorClasses[color],
              )}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {eyebrow && (
              <span className="truncate text-xs text-text-muted">
                {eyebrow}
              </span>
            )}
            <h2 className="truncate text-xl font-extrabold tracking-tight">
              {title}
            </h2>
          </div>
          {actions}
        </div>
        {stats && <div className="flex flex-wrap gap-x-5 gap-y-1">{stats}</div>}
        {notice}
      </header>
    </>
  );
}
