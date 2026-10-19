import { Slot } from "@radix-ui/react-slot";
import type { AnchorHTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type TextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Render the child element, e.g. a router link, with link styles. */
  asChild?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};

/** Quiet link with an optional leading icon, e.g. a train connection. */
export function TextLink({
  asChild = false,
  className,
  ...props
}: TextLinkProps) {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      className={cn(
        "inline-flex items-center gap-2 rounded-sm text-sm text-text-muted transition-colors hover:text-text hover:underline",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
