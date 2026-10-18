import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../theme/ThemeScope";
import { fieldBase } from "./Input";

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export function Select({
  options,
  placeholder,
  size = "md",
  id,
  "aria-label": ariaLabel,
  ...props
}: SelectProps) {
  const { t } = useTranslation("ui");
  const container = usePortalContainer();
  return (
    <SelectPrimitive.Root {...props}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          fieldBase,
          "flex items-center justify-between gap-2 text-left data-placeholder:text-text-muted",
          size === "sm" && "h-8 px-2 text-xs",
        )}
      >
        <SelectPrimitive.Value
          placeholder={placeholder ?? t("select.placeholder")}
        />
        <SelectPrimitive.Icon className="text-text-muted">
          <ChevronDown className="size-4" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          style={{ minWidth: "var(--radix-select-trigger-width)" }}
          className="z-popover overflow-hidden rounded-md border border-border bg-surface-raised text-text shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "relative flex h-8 cursor-default items-center rounded-sm pr-8 pl-2 text-base outline-none select-none",
                  "data-highlighted:bg-hover data-[state=checked]:font-semibold",
                )}
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex">
                  <Check className="size-4" aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
