import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { Tooltip } from "./Tooltip";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  /** Accessible name, also shown as tooltip. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
};

export function IconButton({
  label,
  icon,
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip label={label}>
      <Button iconOnly aria-label={label} variant={variant} {...props}>
        {icon}
      </Button>
    </Tooltip>
  );
}
