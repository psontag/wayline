import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../theme/ThemeScope";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "neutral" | "danger";
};

export type MenuProps = {
  /** A button, e.g. an IconButton. */
  trigger: ReactElement;
  items: MenuItem[];
  align?: "start" | "end";
};

/** A short list of actions behind a button, e.g. duplicate and delete. */
export function Menu({ trigger, items, align = "end" }: MenuProps) {
  const container = usePortalContainer();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="z-popover min-w-24 rounded-md border border-border bg-surface-raised p-1 text-text shadow-md"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              onSelect={item.onSelect}
              className={cn(
                "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-base outline-none select-none",
                "data-highlighted:bg-hover [&_svg]:size-4 [&_svg]:shrink-0",
                item.tone === "danger" ? "text-danger" : "text-text",
              )}
            >
              {item.icon}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
