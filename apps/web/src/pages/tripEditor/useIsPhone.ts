import { useSyncExternalStore } from "react";

// Below the md breakpoint of the design tokens.
const query = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const list = matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** True on phone-sized screens, where the editor shows a bottom sheet. */
export function useIsPhone() {
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches);
}
