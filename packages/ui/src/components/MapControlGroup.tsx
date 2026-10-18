import type { ReactNode } from "react";

/** Floating stack of icon buttons on the map, e.g. zoom in and out. */
export function MapControlGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-surface shadow-md *:rounded-none">
      {children}
    </div>
  );
}
