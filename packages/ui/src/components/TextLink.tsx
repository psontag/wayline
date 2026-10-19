import type { AnchorHTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type TextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: Ref<HTMLAnchorElement>;
};

/** Quiet link with an optional leading icon, e.g. a train connection. */
export function TextLink({ className, ...props }: TextLinkProps) {
  return (
    <a
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
