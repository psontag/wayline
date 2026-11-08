import { Button } from "./Button";

export type PlaceBarProps = {
  /** What is being placed, e.g. "Place via point". */
  title: string;
  /** The change so far, e.g. "+6 km · +120 m". Empty while routing. */
  detail?: string;
  cancelLabel: string;
  doneLabel: string;
  onCancel: () => void;
  onDone: () => void;
  /** Done waits, e.g. while an edit saves. */
  busy?: boolean;
};

/** Floating bar on the map while a point is placed: what changes, Cancel, Done. */
export function PlaceBar({
  title,
  detail,
  cancelLabel,
  doneLabel,
  onCancel,
  onDone,
  busy,
}: PlaceBarProps) {
  return (
    <div
      role="group"
      aria-label={title}
      className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-surface-raised p-2 pl-4 shadow-md"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold text-text">{title}</span>
        <span
          aria-live="polite"
          className="h-4 text-xs text-text-muted tabular-nums"
        >
          {detail}
        </span>
      </div>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button size="sm" variant="primary" disabled={busy} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
