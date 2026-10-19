import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const base = cn(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm font-semibold whitespace-nowrap",
  "transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
  "[&_svg]:size-4 [&_svg]:shrink-0",
  focusRing,
);

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent font-bold text-on-accent hover:brightness-95 active:brightness-90",
  secondary:
    "border border-border bg-surface text-text hover:bg-hover active:bg-active",
  ghost:
    "bg-transparent text-text hover:bg-hover active:bg-active aria-[current=page]:bg-selected",
  danger:
    "border border-border bg-surface font-bold text-danger hover:bg-hover active:bg-active",
};

const sizes: Record<ButtonSize, { text: string; icon: string }> = {
  sm: { text: "h-8 px-2.5 text-sm", icon: "size-8" },
  md: { text: "h-10 px-4 text-base", icon: "size-10" },
  lg: { text: "h-11 px-4 text-base", icon: "size-11" },
};

type CommonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element, e.g. a link, with button styles. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** A button with text, or an icon-only button that must have an aria-label. */
export type ButtonProps = CommonProps &
  (
    | { children: ReactNode; iconOnly?: false }
    | { children: ReactNode; iconOnly: true; "aria-label": string }
  );

export function Button({
  variant = "secondary",
  size = "md",
  asChild = false,
  iconOnly = false,
  className,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        base,
        variants[variant],
        iconOnly ? sizes[size].icon : sizes[size].text,
        className,
      )}
      {...props}
    />
  );
}
