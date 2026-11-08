import { type RefObject, useEffect, useRef, useState } from "react";

export type PointerKind = "mouse" | "touch";

const initial = (): PointerKind =>
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches
    ? "touch"
    : "mouse";

/**
 * The kind of the last pointer that pressed anywhere. A pen counts as
 * touch. The ref is current inside event handlers; the value is for render.
 */
export function useLastPointer(): [RefObject<PointerKind>, PointerKind] {
  const [kind, setKind] = useState(initial);
  const ref = useRef(kind);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const next = event.pointerType === "mouse" ? "mouse" : "touch";
      ref.current = next;
      setKind(next);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);
  return [ref, kind];
}

/** True when keys go to a text field, so shortcuts must not act. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}
