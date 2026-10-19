import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../theme/ThemeScope";

/** Dropdown menu. The trigger is usually an IconButton. */
export function Menu({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  const container = usePortalContainer();
  return (
    <MenuPrimitive.Root modal={false}>
      <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal container={container}>
        <MenuPrimitive.Content
          align="end"
          sideOffset={4}
          className="z-popover overflow-hidden rounded-md border border-border bg-surface-raised p-1 text-text shadow-md"
        >
          {children}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export type MenuItemProps = {
  icon?: ReactNode;
  tone?: "default" | "danger";
  onSelect?: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export function MenuItem({
  icon,
  tone = "default",
  onSelect,
  disabled,
  children,
}: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-sm pr-6 pl-2 text-base whitespace-nowrap outline-none select-none",
        "data-disabled:opacity-50 data-highlighted:bg-hover [&_svg]:size-4 [&_svg]:shrink-0",
        tone === "danger" ? "text-danger" : "text-text",
      )}
    >
      {icon}
      {children}
    </MenuPrimitive.Item>
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-border" />;
}
