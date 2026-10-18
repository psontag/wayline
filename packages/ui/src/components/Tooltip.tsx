import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { usePortalContainer } from "../theme/ThemeScope";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={container}>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-popover rounded-sm bg-inverse px-2 py-1 text-xs font-semibold text-on-inverse shadow-md"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
