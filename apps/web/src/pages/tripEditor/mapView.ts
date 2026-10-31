import type { MapLayerKind } from "@wayline/ui";
import { useState } from "react";

/** View of the panel under the trip map. Weather adds the weather map. */
export type PanelView = "elevation" | "weather";

export type MapLayers = Record<MapLayerKind, boolean>;

const allOn: MapLayers = {
  hotels: true,
  stations: true,
  rain: true,
  wind: true,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: the choice stays for this page only.
  }
}

/** A choice that is kept per browser. */
function useStored<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState(() => read(key, fallback));
  return [
    value,
    (next) => {
      setValue(next);
      write(key, next);
    },
  ];
}

export function usePanelView() {
  const [stored, set] = useStored("wayline.panelView", {
    view: "elevation" as PanelView,
  });
  return [stored.view, (view: PanelView) => set({ view })] as const;
}

export function useMapLayers() {
  return useStored("wayline.mapLayers", allOn);
}
