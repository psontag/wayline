import { useRef, useState } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type InlineEditProps = {
  value: string;
  /** Called with the trimmed text on Enter or blur. */
  onCommit: (value: string) => void;
  onCancel: () => void;
  "aria-label": string;
  className?: string;
};

/** Text field that replaces a title while it is renamed. */
export function InlineEdit({
  value,
  onCommit,
  onCancel,
  "aria-label": ariaLabel,
  className,
}: InlineEditProps) {
  const [text, setText] = useState(value);
  // Enter ends editing, and the blur that follows must not end it again.
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const trimmed = text.trim();
    if (save && trimmed && trimmed !== value) onCommit(trimmed);
    else onCancel();
  };
  const commit = () => finish(true);
  return (
    <input
      // Opened on purpose by the user, so focus moves here.
      autoFocus
      aria-label={ariaLabel}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") finish(false);
      }}
      className={cn(
        "h-7 min-w-0 rounded-sm border border-border bg-surface px-1.5 text-md font-bold text-text",
        focusRing,
        "focus-visible:outline-offset-0",
        className,
      )}
    />
  );
}
