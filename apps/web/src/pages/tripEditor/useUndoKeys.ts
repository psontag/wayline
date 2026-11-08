import { useEffect, useRef } from "react";
import { isTyping } from "../../components/useLastPointer";
import type { TripEditorState } from "./useTripEditor";

/** ⌘Z undoes, ⇧⌘Z redoes. Ctrl instead of ⌘ elsewhere, also Ctrl+Y. */
export function useUndoKeys(editor: TripEditorState) {
  const latest = useRef(editor);
  useEffect(() => {
    latest.current = editor;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      const redo = (key === "z" && event.shiftKey) || key === "y";
      if (key !== "z" && !redo) return;
      event.preventDefault();
      const ed = latest.current;
      if (redo && ed.canRedo) ed.redo();
      if (!redo && ed.canUndo) ed.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
