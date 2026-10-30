import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../theme/ThemeScope";
import { fieldBase } from "./Input";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Second line, e.g. the kind of place. */
  description?: string;
  icon?: ReactNode;
};

export type ComboboxProps = {
  /** Options for the current search. The caller filters and limits them. */
  options: ComboboxOption[];
  onSearchChange: (search: string) => void;
  value?: string;
  /** The selected option. It may be missing from the filtered options. */
  selected?: ComboboxOption;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Pick one item from a long list by searching, e.g. a place. */
export function Combobox({
  options,
  onSearchChange,
  value,
  selected,
  onValueChange,
  placeholder,
  searchPlaceholder,
  ...props
}: ComboboxProps) {
  const { t } = useTranslation("ui");
  const container = usePortalContainer();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const changeSearch = (next: string) => {
    setSearch(next);
    onSearchChange(next);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) changeSearch("");
      }}
    >
      <Popover.Trigger
        className={cn(
          fieldBase,
          "flex items-center gap-2 text-left aria-invalid:border-danger",
        )}
        {...props}
      >
        {selected?.icon && (
          <span className="shrink-0 text-text-muted [&_svg]:size-4">
            {selected.icon}
          </span>
        )}
        <span className={cn("flex-1 truncate", !selected && "text-text-muted")}>
          {selected?.label ?? placeholder ?? t("select.placeholder")}
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-text-muted"
          aria-hidden
        />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          // As wide as the names need, at least the field, at most the screen.
          style={{
            width: "max-content",
            minWidth: "var(--radix-popover-trigger-width)",
            maxWidth: "min(var(--container-sm), 100vw - 2 * var(--spacing-2))",
          }}
          className="z-popover overflow-hidden rounded-md border border-border bg-surface-raised text-text shadow-md"
        >
          <Command shouldFilter={false} loop>
            <div className="flex h-10 items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
              <Command.Input
                value={search}
                onValueChange={changeSearch}
                placeholder={searchPlaceholder ?? t("combobox.search")}
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-muted"
              />
            </div>
            <Command.List className="p-1">
              <Command.Empty className="px-2 py-3 text-sm text-text-muted">
                {t("combobox.empty")}
              </Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    changeSearch("");
                  }}
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-base select-none data-[selected=true]:bg-hover"
                >
                  {option.icon && (
                    <span className="shrink-0 text-text-muted [&_svg]:size-4">
                      {option.icon}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="truncate text-xs text-text-muted">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {option.value === value && (
                    <Check className="size-4 shrink-0" aria-hidden />
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
