import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** A failed action, shown next to its button or field. */
export function InlineError({
  id,
  size = "sm",
  className,
  children,
}: {
  /** For aria-describedby on the control. */
  id?: string;
  size?: "xs" | "sm";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      id={id}
      role="alert"
      className={cn(
        "text-danger",
        size === "xs" ? "text-xs" : "text-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}
