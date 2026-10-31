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
 * Bordered list whose rows move by dragging the handle, or with the arrow
 * keys while the handle has focus.
 */
export function SortableList<T>({
  items,
  getKey,
  onMove,
  renderItem,
  handleLabel,
  className,
}: SortableListProps<T>) {
  const [dragged, setDragged] = useState<number>();
  const [target, setTarget] = useState<number>();
  const handles = useRef(new Map<string, HTMLButtonElement>());

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const item = items[from];
    onMove(from, to);
    // Keep the focus on the handle of the moved item.
    if (item)
      requestAnimationFrame(() => handles.current.get(getKey(item))?.focus());
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
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDragged(index);
            }}
            onDragOver={(event) => {
              if (dragged === undefined) return;
              event.preventDefault();
              setTarget(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== undefined) move(dragged, index);
              setDragged(undefined);
              setTarget(undefined);
            }}
            onDragEnd={() => {
              setDragged(undefined);
              setTarget(undefined);
            }}
            className={cn(
              "flex items-start gap-1 border-t border-border bg-surface first:border-t-0",
              dragged === index && "opacity-50",
              target === index && dragged !== index && "bg-selected",
            )}
          >
            <button
              type="button"
              aria-label={handleLabel(item, index)}
              ref={(el) => {
                if (el) handles.current.set(key, el);
                else handles.current.delete(key);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") move(index, index - 1);
                else if (event.key === "ArrowDown") move(index, index + 1);
                else return;
                event.preventDefault();
              }}
              className={cn(
                "flex h-14 w-8 shrink-0 cursor-grab items-center justify-center rounded-sm text-text-muted hover:text-text",
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
