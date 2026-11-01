import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { type SectionIcon, sectionIcons } from "../icons";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type PanelSectionProps = {
  icon: SectionIcon;
  title: string;
  /** Current choice or key numbers, on the right of the header. */
  summary?: ReactNode;
  /** Folds with a chevron. */
  collapsible?: boolean;
  /** Only for collapsible sections. */
  defaultOpen?: boolean;
  /** One line with an action, shown also when folded. */
  notice?: ReactNode;
  children?: ReactNode;
};

/** One part of a side panel: icon, title and summary, then the content. */
export function PanelSection({
  icon,
  title,
  summary,
  collapsible = false,
  defaultOpen = true,
  notice,
  children,
}: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const Icon = sectionIcons[icon];
  const expanded = !collapsible || open;
  const header = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="shrink-0 text-sm font-bold">{title}</span>
      <span className="min-w-0 flex-1 truncate text-right text-xs text-text-muted tabular-nums">
        {summary}
      </span>
      {collapsible && (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-text-muted transition-transform",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
      )}
    </>
  );
  const row = "flex h-11 w-full items-center gap-2 px-4";

  return (
    <section className="flex flex-col border-b border-border">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className={cn(row, "text-left hover:bg-hover", focusRing)}
        >
          {header}
        </button>
      ) : (
        <h3 className={row}>{header}</h3>
      )}
      {notice && <div className="px-4 pb-3">{notice}</div>}
      {expanded && children && (
        <div id={bodyId} className="flex flex-col gap-3 px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}
