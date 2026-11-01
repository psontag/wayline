import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export type ChangeNoticeProps = {
  /** "Route changed" */
  title: string;
  /** "1 via point · +9 km · +80 m" */
  detail?: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  /** Defaults to a pencil, for edits. */
  icon?: ReactNode;
  /** Called with true while the pointer or focus is on the notice. */
  onHighlight?: (on: boolean) => void;
};

/** Says that something differs from the proposal, with a way back. */
export function ChangeNotice({
  title,
  detail,
  actionLabel,
  onAction,
  disabled,
  icon = <Pencil className="size-4 shrink-0" aria-hidden />,
  onHighlight,
}: ChangeNoticeProps) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-md bg-selected px-2.5 py-2"
      onPointerEnter={onHighlight && (() => onHighlight(true))}
      onPointerLeave={onHighlight && (() => onHighlight(false))}
      onFocus={onHighlight && (() => onHighlight(true))}
      onBlur={onHighlight && (() => onHighlight(false))}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-wrap gap-x-1.5 text-sm">
        <strong>{title}</strong>
        {detail && <span className="text-text-muted">{detail}</span>}
      </span>
      <Button size="sm" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
