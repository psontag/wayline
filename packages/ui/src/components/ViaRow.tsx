import { X } from "lucide-react";
import { IconButton } from "./IconButton";

export type ViaRowProps = {
  /** Position in the route, from 1. */
  n: number;
  name: string;
  /** Muted line below, e.g. the distance from the start. */
  detail?: string;
  removeLabel: string;
  onRemove: () => void;
};

/** One via point in a list, with a remove button. */
export function ViaRow({
  n,
  name,
  detail,
  removeLabel,
  onRemove,
}: ViaRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-via-point bg-surface text-xs font-extrabold text-text tabular-nums">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{name}</span>
        {detail && (
          <span className="text-xs text-text-muted tabular-nums">{detail}</span>
        )}
      </div>
      <IconButton
        size="sm"
        label={removeLabel}
        icon={<X aria-hidden />}
        onClick={onRemove}
      />
    </div>
  );
}
