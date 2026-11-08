import { X } from "lucide-react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";
import { IconButton } from "./IconButton";

export type ViaRowProps = {
  /** Position in the route, from 1. */
  n: number;
  name: string;
  /** Muted line below, e.g. the distance from the start. */
  detail?: string;
  /** Also selected on the map. */
  selected?: boolean;
  /** Selects the point. Without it, the row is plain text. */
  onSelect?: () => void;
  removeLabel: string;
  onRemove: () => void;
};

/** One via point in a list, with a remove button. */
export function ViaRow({
  n,
  name,
  detail,
  selected,
  onSelect,
  removeLabel,
  onRemove,
}: ViaRowProps) {
  const body = (
    <>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-via-point text-xs font-extrabold tabular-nums",
          selected ? "bg-via-point text-surface" : "bg-surface text-text",
        )}
      >
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{name}</span>
        {detail && (
          <span className="text-xs text-text-muted tabular-nums">{detail}</span>
        )}
      </span>
    </>
  );
  return (
    <div
      className={cn(
        "-mx-2 flex items-center gap-1 rounded-sm px-2 py-1",
        selected && "bg-selected",
      )}
    >
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left",
            focusRing,
          )}
          onClick={onSelect}
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <IconButton
        size="sm"
        label={removeLabel}
        icon={<X aria-hidden />}
        onClick={onRemove}
      />
    </div>
  );
}
