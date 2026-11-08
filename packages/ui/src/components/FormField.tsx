import type { ReactNode } from "react";
import { type StatIcon, statIcons } from "../icons";
import { cn } from "../lib/cn";
import { InlineError } from "./InlineError";
import { Label } from "./Input";

export type FormFieldProps = {
  label: string;
  /** Stat icon before the label, e.g. "distance" for km per day. */
  icon?: StatIcon;
  /** Id of the control. Leave out for groups and use labelId. */
  htmlFor?: string;
  /** Id of the label, for groups that point to it with aria-labelledby. */
  labelId?: string;
  /** Muted text after the label, e.g. "(optional)". */
  note?: string;
  /** Muted text below the control. */
  hint?: string;
  /**
   * Shown below the control instead of the hint. The control sets
   * aria-invalid and aria-describedby={errorId}.
   */
  error?: string;
  /** Defaults to `${htmlFor}-error`. */
  errorId?: string;
  className?: string;
  children: ReactNode;
};

/** Label, control and an error or hint below it. */
export function FormField({
  label,
  icon,
  htmlFor,
  labelId,
  note,
  hint,
  error,
  errorId,
  className,
  children,
}: FormFieldProps) {
  const Icon = icon && statIcons[icon];
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label
        htmlFor={htmlFor}
        id={labelId}
        className={cn("font-bold", Icon && "flex items-center gap-1.5")}
      >
        {Icon && <Icon aria-hidden className="size-3.5 text-text-muted" />}
        {label}
        {note && <span className="font-medium text-text-muted"> {note}</span>}
      </Label>
      {children}
      {error ? (
        <InlineError id={errorId ?? (htmlFor && `${htmlFor}-error`)} size="xs">
          {error}
        </InlineError>
      ) : (
        hint && <span className="text-xs text-text-muted">{hint}</span>
      )}
    </div>
  );
}
