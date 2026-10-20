import type { ReactNode } from "react";

/** Short instruction that floats over a map, e.g. "Click to set the start". */
export function MapHint({
  icon,
  children,
}: {
  /** A Lucide icon. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      role="status"
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text shadow-md [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted"
    >
      {icon}
      {children}
    </span>
  );
}
