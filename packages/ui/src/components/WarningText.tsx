import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** A short problem note in a row, e.g. "1 place to sleep". */
export function WarningText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("flex items-center gap-1 text-xs text-warning", className)}
    >
      <TriangleAlert className="size-3 shrink-0" aria-hidden />
      {children}
    </span>
  );
}
