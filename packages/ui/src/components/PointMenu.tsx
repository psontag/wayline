import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type PointMenuItem = {
  label: string;
  /** Muted line below, e.g. how far off the route the spot is. */
  detail?: string;
  /** A Lucide icon. */
  icon?: ReactNode;
  onSelect: () => void;
};

export type PointMenuProps = {
  /** Names the menu for screen readers. */
  label: string;
  /** What is at the spot, above the actions, e.g. the nearest town. */
  heading?: { title: string; detail?: string };
  items: PointMenuItem[];
};

/** Actions for a spot on the map, from a right-click or a long-press. */
export function PointMenu({ label, heading, items }: PointMenuProps) {
  return (
    <div
      role="menu"
      aria-label={label}
      className="flex max-w-popover flex-col rounded-md border border-border bg-surface-raised p-1 shadow-md"
    >
      {heading && (
        <div className="flex flex-col border-b border-border px-3 pt-1.5 pb-2">
          <span className="truncate text-sm font-bold text-text">
            {heading.title}
          </span>
          {heading.detail && (
            <span className="text-xs text-text-muted tabular-nums">
              {heading.detail}
            </span>
          )}
        </div>
      )}
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={cn(
            "flex items-start gap-2 rounded-sm px-3 py-2 text-left hover:bg-hover active:bg-active [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted",
            focusRing,
          )}
          onClick={item.onSelect}
        >
          {item.icon}
          <span className="flex flex-col">
            <span className="text-sm font-bold text-text">{item.label}</span>
            {item.detail && (
              <span className="text-xs text-text-muted tabular-nums">
                {item.detail}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
