import type { LonLat } from "@wayline/domain";
import {
  IconButton,
  MapControlGroup,
  MapLayerMenu,
  type MapLayerMenuProps,
  MapLegend,
  type MapLegendItem,
  useTheme,
} from "@wayline/ui";
import { Minus, Plus } from "lucide-react";
import { type LngLatBoundsLike, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import MapGL, {
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { HillshadeLayer } from "../HillshadeLayer";
import { NetworkLayer } from "../NetworkLayer";
import { useHiddenPlaceLabels } from "../placeLabels";

// MapLibre finds its worker next to its own module. Vite moves both, so
// point it to the worker that Vite bundles.
setWorkerUrl(workerUrl);

export const mapStyles = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Area with route data. Shown when there is nothing to fit yet. */
const regionBounds: LngLatBoundsLike = [10.45, 49.59, 12.26, 50.52];

// Marker labels sit right of the point, and the legend sits bottom left.
const defaultPadding: MapPadding = {
  top: 56,
  right: 120,
  bottom: 72,
  left: 56,
};

/** Hillshade and network go below this layer, screen layers above it. */
const ROUTES_ANCHOR = "app-routes";

export type MapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type MapNetwork = "full" | "quiet" | "off";

export type AppMapProps = {
  /** Accessible name of the map region. */
  label: string;
  /** Points to show. The map fits them on load and when fitKey changes. */
  fit: LonLat[];
  /** Fit again when this changes. Defaults to the fit points themselves. */
  fitKey?: unknown;
  /** Points to show on load, if they differ from fit. */
  initialFit?: LonLat[];
  /** Space around fit points, e.g. for a sheet over the map. */
  padding?: MapPadding;
  /** Signed cycling routes. Quiet when our own routes matter more. */
  network?: MapNetwork;
  /** Points the network is loaded around. Defaults to the fit points. */
  networkAround?: LonLat[];
  /** Base map place names to hide, because our markers show them. */
  hiddenLabels?: string[];
  /** Legend items after the network. */
  legend?: MapLegendItem[];
  /** Layers to turn on and off. The legend then moves into their menu. */
  layers?: Omit<MapLayerMenuProps, "legend">;
  /** Zoom buttons and legend. Phones zoom with two fingers. */
  controls?: boolean;
  /** Short hint at the top left, e.g. how to edit the route. */
  hint?: ReactNode;
  /** Overlays above the map, e.g. a toast. */
  overlay?: ReactNode;
  mapRef?: RefObject<MapRef | null>;
  /** Layers that react to the pointer. Hovering them shows a pointer. */
  interactiveLayerIds?: string[];
  /** Overrides the cursor, e.g. while dragging. */
  cursor?: string;
  onClick?: (event: MapLayerMouseEvent) => void;
  onMouseMove?: (event: MapLayerMouseEvent) => void;
  onMouseDown?: (event: MapLayerMouseEvent) => void;
  onMouseLeave?: (event: MapLayerMouseEvent) => void;
  onZoomEnd?: (zoom: number) => void;
  /** Sources, layers and markers of the screen. */
  children?: ReactNode;
};

/** Bounds of the points. A single point gets some room around it. */
export function boundsOf(coords: LonLat[]): LngLatBoundsLike {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  if (e - w < 0.02 && n - s < 0.02)
    return [w - 0.25, s - 0.15, e + 0.25, n + 0.15];
  return [w, s, e, n];
}

const LabelLayerContext = createContext<string | undefined>(undefined);

/** A layer of the screen. It goes below the base map labels. */
export function MapLayer(props: LayerProps) {
  const beforeId = useContext(LabelLayerContext);
  return <Layer beforeId={beforeId} {...props} />;
}

/**
 * The map of every screen. It owns the base map, theme, hillshade,
 * network, controls, legend and fitting. Screens add their own layers
 * with MapLayer, and markers, as children.
 */
export function AppMap({
  label,
  fit,
  fitKey,
  initialFit,
  padding = defaultPadding,
  network = "quiet",
  networkAround,
  hiddenLabels = [],
  legend = [],
  layers,
  controls = true,
  hint,
  overlay,
  mapRef: outerRef,
  interactiveLayerIds,
  cursor,
  onClick,
  onMouseMove,
  onMouseDown,
  onMouseLeave,
  onZoomEnd,
  children,
}: AppMapProps) {
  const { t } = useTranslation("map");
  const { resolvedTheme } = useTheme();
  const ownRef = useRef<MapRef>(null);
  const mapRef = outerRef ?? ownRef;
  const [labelLayerId, setLabelLayerId] = useState<string>();
  const [hovering, setHovering] = useState(false);

  const hideLabels = useHiddenPlaceLabels(mapRef, hiddenLabels);
  const onStyle = () => {
    const layers = mapRef.current?.getStyle()?.layers ?? [];
    setLabelLayerId(layers.find((layer) => layer.type === "symbol")?.id);
    hideLabels();
  };

  // Fit when the key changes, not on load: initialViewState does that.
  const key = JSON.stringify(fitKey === undefined ? fit : fitKey);
  const fitted = useRef(key);
  const latest = useRef({ fit, padding });
  useEffect(() => {
    latest.current = { fit, padding };
  });
  useEffect(() => {
    if (fitted.current === key) return;
    fitted.current = key;
    const { fit, padding } = latest.current;
    if (!fit.length) return;
    mapRef.current?.fitBounds(boundsOf(fit), {
      padding,
      maxZoom: 12,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 600,
    });
  }, [key, mapRef]);

  // With layers, the network has its own toggle in the menu.
  const legendItems: MapLegendItem[] = [
    ...(network === "off" || layers
      ? []
      : [{ label: t("network"), line: "network" as const }]),
    ...legend,
  ];

  return (
    <div className="absolute inset-0" role="region" aria-label={label}>
      <MapGL
        ref={mapRef}
        initialViewState={{
          bounds: (initialFit ?? fit).length
            ? boundsOf(initialFit ?? fit)
            : regionBounds,
          fitBoundsOptions: { padding, maxZoom: 12 },
        }}
        minZoom={5}
        maxZoom={18}
        mapStyle={mapStyles[resolvedTheme]}
        style={{ position: "absolute", inset: "0" }}
        attributionControl={{ compact: true }}
        onLoad={onStyle}
        onStyleData={onStyle}
        interactiveLayerIds={interactiveLayerIds}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onZoomEnd={(event) => onZoomEnd?.(event.viewState.zoom)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={(event) => {
          setHovering(false);
          onMouseLeave?.(event);
        }}
        cursor={cursor ?? (hovering ? "pointer" : undefined)}
      >
        {/* First, so it is back before the layers that refer to it after a
            style swap. */}
        <Layer
          id={ROUTES_ANCHOR}
          type="background"
          layout={{ visibility: "none" }}
          beforeId={labelLayerId}
        />
        <HillshadeLayer beforeId={ROUTES_ANCHOR} />
        {network !== "off" && (
          <NetworkLayer
            around={networkAround ?? fit}
            beforeId={ROUTES_ANCHOR}
            subtle={network === "quiet"}
          />
        )}
        <LabelLayerContext.Provider value={labelLayerId}>
          {children}
        </LabelLayerContext.Provider>
      </MapGL>
      {hint && (
        <div className="pointer-events-none absolute top-3 left-3 z-panel">
          {hint}
        </div>
      )}
      {!controls && layers && (
        // Below a floating header, as on phones.
        <div className="absolute top-16 right-3 z-panel">
          <MapControlGroup>
            <MapLayerMenu {...layers} legend={legendItems} />
          </MapControlGroup>
        </div>
      )}
      {controls && (
        <>
          <div className="absolute top-3 right-3 z-panel">
            <MapControlGroup>
              <IconButton
                label={t("zoomIn")}
                icon={<Plus aria-hidden />}
                size="sm"
                onClick={() => mapRef.current?.zoomIn()}
              />
              <IconButton
                label={t("zoomOut")}
                icon={<Minus aria-hidden />}
                size="sm"
                onClick={() => mapRef.current?.zoomOut()}
              />
            </MapControlGroup>
            {layers && (
              <div className="mt-2">
                <MapControlGroup>
                  <MapLayerMenu {...layers} legend={legendItems} />
                </MapControlGroup>
              </div>
            )}
          </div>
          {!layers && legendItems.length > 0 && (
            <div className="absolute bottom-3 left-3 z-panel max-sm:hidden">
              <MapLegend items={legendItems} />
            </div>
          )}
        </>
      )}
      {overlay}
    </div>
  );
}
