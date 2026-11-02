import { useEffect, useRef, useState } from "react";

/**
 * A hovered value that changes only after the pointer rests. Moving between
 * two items skips the moment when neither is hovered.
 */
export function useDebouncedHover<T>(ms: number) {
  const [value, setValue] = useState<T>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (next: T | undefined) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setValue(next), ms);
  };
  return [value, set] as const;
}
