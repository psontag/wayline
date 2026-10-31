import { GripVertical } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { focusRing } from "./Button";

export type SortableListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  /** Moves the item at from to the index to. */
  onMove: (from: number, to: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** Accessible name of the drag handle of an item. */
  handleLabel: (item: T, index: number) => string;
  className?: string;
};

/**
 * Bordered list whose rows move by dragging the handle, with a mouse or a
 * finger, or with the arrow keys while the handle has focus.
 */
export function SortableList<T>({
  items,
  getKey,
  onMove,
  renderItem,
  handleLabel,
  className,
}: SortableListProps<T>) {
  const [drag, setDrag] = useState<{ from: number; over: number }>();
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const item = items[from];
    onMove(from, to);
    // Keep the focus on the handle of the moved item.
    if (item)
      requestAnimationFrame(() => handles.current.get(getKey(item))?.focus());
  };

  /** Index of the row under the pointer, or the nearest end. */
  const rowAt = (y: number) => {
    let index = 0;
    for (const [i, item] of items.entries()) {
      const rect = rows.current.get(getKey(item))?.getBoundingClientRect();
      if (rect && y >= rect.top) index = i;
    }
    return index;
  };

  return (
    <ol
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-border",
        className,
      )}
    >
      {items.map((item, index) => {
        const key = getKey(item);
        return (
          <li
            key={key}
            ref={(el) => {
              if (el) rows.current.set(key, el);
              else rows.current.delete(key);
            }}
            className={cn(
              "flex items-start gap-1 border-t border-border bg-surface first:border-t-0",
              drag?.from === index && "opacity-50",
              drag &&
                drag.over === index &&
                drag.from !== index &&
                "bg-selected",
            )}
          >
            <button
              type="button"
              aria-label={handleLabel(item, index)}
              ref={(el) => {
                if (el) handles.current.set(key, el);
                else handles.current.delete(key);
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag({ from: index, over: index });
              }}
              onPointerMove={(event) => {
                if (!drag) return;
                const over = rowAt(event.clientY);
                if (over !== drag.over) setDrag({ ...drag, over });
              }}
              onPointerUp={() => {
                if (drag) move(drag.from, drag.over);
                setDrag(undefined);
              }}
              onPointerCancel={() => setDrag(undefined)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") move(index, index - 1);
                else if (event.key === "ArrowDown") move(index, index + 1);
                else return;
                event.preventDefault();
              }}
              className={cn(
                "flex h-14 w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-text-muted hover:text-text active:cursor-grabbing",
                focusRing,
              )}
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
            <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
          </li>
        );
      })}
    </ol>
  );
}
