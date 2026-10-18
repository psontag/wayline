import * as LabelPrimitive from "@radix-ui/react-label";
import {
  useId,
  type ComponentProps,
  type InputHTMLAttributes,
  type Ref,
} from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-sm font-semibold text-text", className)}
      {...props}
    />
  );
}

export const fieldBase = cn(
  "h-10 w-full rounded-sm border border-border bg-surface px-3 text-base text-text tabular-nums",
  "transition-colors hover:border-text-muted disabled:opacity-50",
  focusRing,
  "focus-visible:outline-offset-0",
);

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Shown above the input. */
  label?: string;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ label, id, className, ...props }: InputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const input = (
    <input
      id={inputId}
      className={cn(fieldBase, "placeholder:text-text-muted", className)}
      {...props}
    />
  );
  if (!label) return input;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      {input}
    </div>
  );
}
