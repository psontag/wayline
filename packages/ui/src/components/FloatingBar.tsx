import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type FloatingButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> & {
  /** Accessible name. */
  label: string;
  variant?: "surface" | "accent";
  /** Render the child element, e.g. a link, with these styles. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** Round button that floats over a map, e.g. on phones. */
export function FloatingButton({
  label,
  variant = "surface",
  asChild = false,
  className,
  type,
  ...props
}: FloatingButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      aria-label={label}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full shadow-md transition-colors",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        variant === "surface"
          ? "border border-border bg-surface text-text hover:bg-hover"
          : "bg-accent text-on-accent hover:brightness-95",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

/** Pill with a title and a short line below, between floating buttons. */
export function FloatingTitle({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-11 min-w-0 flex-1 flex-col justify-center rounded-full border border-border bg-surface px-3.5 shadow-md">
      <span className="truncate font-extrabold">{title}</span>
      {subtitle && (
        <span className="truncate text-2xs text-text-muted tabular-nums">
          {subtitle}
        </span>
      )}
      {children}
    </div>
  );
}
