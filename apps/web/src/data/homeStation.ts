import { useSyncExternalStore } from "react";

const storageKey = "wayline.homeStation";
export const DEFAULT_HOME_STATION = "Karlsruhe Hbf";

const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(storageKey) ?? DEFAULT_HOME_STATION;
  } catch {
    return DEFAULT_HOME_STATION;
  }
}

/** Station the train links start from and go back to. Stored per browser. */
export function useHomeStation(): [string, (station: string) => void] {
  const station = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => DEFAULT_HOME_STATION,
  );
  const set = (next: string) => {
    try {
      localStorage.setItem(storageKey, next.trim());
    } catch {
      // Private mode: the station stays for this page only.
    }
    for (const listener of listeners) listener();
  };
  return [station, set];
}
