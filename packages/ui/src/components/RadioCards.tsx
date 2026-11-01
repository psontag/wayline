import * as RadioGroup from "@radix-ui/react-radio-group";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type RadioCardOption = { value: string; label: string; hint?: string };

export type RadioCardsProps = {
  options: RadioCardOption[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/** One choice out of a few, each with a short hint, e.g. the kind of trip. */
export function RadioCards({
  options,
  value,
  onValueChange,
  ...props
}: RadioCardsProps) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      className={cn(
        "grid gap-2",
        options.length > 2 ? "grid-cols-3" : "grid-cols-2",
      )}
      {...props}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-md border border-border bg-surface px-3 py-2.5 text-left text-base text-text",
            "transition-colors hover:bg-hover",
            "data-[state=checked]:border-selected-border data-[state=checked]:bg-selected",
            focusRing,
          )}
        >
          <span className="font-bold">{option.label}</span>
          {option.hint && (
            <span className="text-xs text-text-muted">{option.hint}</span>
          )}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
