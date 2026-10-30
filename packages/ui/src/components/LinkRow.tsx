import { ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type LinkRowProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title" | "children"
> & {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
};

/** Outlined row that opens a detail view. */
export function LinkRow({
  icon,
  title,
  subtitle,
  className,
  ...props
}: LinkRowProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md border border-border bg-surface p-3 text-left text-base text-text transition-colors hover:bg-hover",
        "[&>svg]:size-4 [&>svg]:shrink-0",
        focusRing,
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{title}</span>
        {subtitle && (
          <span className="truncate text-xs text-text-muted">{subtitle}</span>
        )}
      </span>
      <ChevronRight aria-hidden />
    </button>
  );
}
