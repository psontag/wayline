import type {
  FilterSpecification,
  Map as MaplibreMap,
  StyleLayer,
} from "maplibre-gl";
import { type RefObject, useCallback, useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";

// Filters of the base style, per layer instance. A new style has new
// instances, so its filters are read again.
const baseFilters = new WeakMap<StyleLayer, FilterSpecification | undefined>();

/**
 * Hides the base map's place labels with these names, so they don't
 * show twice next to our own markers.
 */
export function hidePlaceLabels(map: MaplibreMap, names: string[]) {
  const hide: FilterSpecification = [
    "!",
    ["in", ["get", "name"], ["literal", names]],
  ];
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol" || layer["source-layer"] !== "place") continue;
    const live = map.getLayer(layer.id);
    if (!live) continue;
    if (!baseFilters.has(live)) baseFilters.set(live, layer.filter);
    const base = baseFilters.get(live);
    const filter: FilterSpecification | null = names.length
      ? base
        ? (["all", base, hide] as FilterSpecification)
        : hide
      : (base ?? null);
    const current: unknown = map.getFilter(layer.id) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(filter)) {
      map.setFilter(layer.id, filter);
    }
  }
}

/**
 * Keeps the place labels with these names hidden. Pass the returned
 * callback to onLoad and onStyleData, so it runs again after a style swap.
 */
export function useHiddenPlaceLabels(
  mapRef: RefObject<MapRef | null>,
  names: string[],
): () => void {
  const key = names.join("\n");
  const apply = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map?.isStyleLoaded()) hidePlaceLabels(map, key ? key.split("\n") : []);
  }, [mapRef, key]);
  useEffect(apply, [apply]);
  return apply;
}
