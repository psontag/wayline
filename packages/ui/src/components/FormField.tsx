import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Label } from "./Input";

export type FormFieldProps = {
  label: string;
  /** Id of the control. Leave out for groups and use labelId. */
  htmlFor?: string;
  /** Id of the label, for groups that point to it with aria-labelledby. */
  labelId?: string;
  /** Muted text after the label, e.g. "(optional)". */
  note?: string;
  /** Muted text below the control. */
  hint?: string;
  /** Shown below the control instead of the hint. Give it errorId. */
  error?: string;
  errorId?: string;
  className?: string;
  children: ReactNode;
};

/** Label, control and an error or hint below it. */
export function FormField({
  label,
  htmlFor,
  labelId,
  note,
  hint,
  error,
  errorId,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} id={labelId} className="font-bold">
        {label}
        {note && <span className="font-medium text-text-muted"> {note}</span>}
      </Label>
      {children}
      {error ? (
        <span id={errorId} className="text-xs text-danger">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs text-text-muted">{hint}</span>
      )}
    </div>
  );
}
