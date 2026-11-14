import type { ReactNode } from "react";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

/** Floating switch for what colors the map, with the key below it. */
export function MapColorSwitch({
  options,
  value,
  onValueChange,
  "aria-label": label,
  legend,
}: {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  /** Key for the current colors. */
  legend?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-1.5 shadow-md">
      <SegmentedControl
        stretch
        aria-label={label}
        options={options}
        value={value}
        onValueChange={onValueChange}
      />
      {legend && <div className="px-1">{legend}</div>}
    </div>
  );
}
