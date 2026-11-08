import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A hovered value that changes only after the pointer rests. Moving between
 * two items skips the moment when neither is hovered.
 */
export function useDebouncedHover<T>(ms: number) {
  const [value, setValue] = useState<T>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = useCallback(
    (next: T | undefined) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(next), ms);
    },
    [ms],
  );
  /** Forget the value at once, e.g. when the items move under the pointer. */
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setValue(undefined);
  }, []);
  return [value, set, clear] as const;
}
