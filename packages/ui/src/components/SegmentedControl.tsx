import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type SegmentedOption = { value: string; label: string };

export type SegmentedControlProps = {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/** One choice out of a few, e.g. the routing profile. */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  ...aria
}: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix sends "" when the active item is clicked again. Keep the choice.
      onValueChange={(next) => next && onValueChange(next)}
      className="inline-flex gap-0.5 rounded-sm border border-border bg-hover p-0.5"
      {...aria}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            "h-8 rounded-sm px-3 text-sm font-medium text-text-muted transition-colors",
            "hover:text-text",
            "data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-text data-[state=on]:shadow-sm",
            focusRing,
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
