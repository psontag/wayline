import {
  IconButton,
  MapControlGroup,
  useTheme,
  useThemeTokens,
} from "@wayline/ui";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { Minus, Plus } from "lucide-react";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapGL, { Layer, Source, type MapRef } from "react-map-gl/maplibre";

// MapLibre finds its worker next to its own module. Vite moves both, so
// point it to the worker that Vite bundles.
setWorkerUrl(workerUrl);

const mapStyles = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

type LngLat = [number, number];

// Hand-drawn demo: Bamberg, up the Main valley to Lichtenfels, then to Coburg.
const bamberg: LngLat = [10.8869, 49.8917];
const coburg: LngLat = [10.9636, 50.2581];

const demoCoordinates: LngLat[] = [
  bamberg,
  [10.8794, 49.9306],
  [10.8878, 49.9714],
  [10.9264, 50.0244],
  [10.9542, 50.0639],
  [11.0033, 50.1028],
  [11.0592, 50.1453],
  [11.0614, 50.1781],
  [11.0583, 50.2075],
  [11.0115, 50.2347],
  coburg,
];

const demoRoute: Feature<LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: demoCoordinates },
};

const demoStops: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [bamberg, coburg].map((coordinates) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates },
  })),
};

export function MapPage() {
  const { t } = useTranslation("map");
  const { resolvedTheme } = useTheme();
  const tokens = useThemeTokens();
  const mapRef = useRef<MapRef>(null);
  // Our layers go below the first label layer, so place names stay readable.
  const [labelLayerId, setLabelLayerId] = useState<string>();
  const findLabelLayer = () => {
    const layers = mapRef.current?.getStyle()?.layers ?? [];
    setLabelLayerId(layers.find((layer) => layer.type === "symbol")?.id);
  };

  return (
    <div
      className="relative min-h-0 flex-1"
      role="region"
      aria-label={t("label")}
    >
      <MapGL
        ref={mapRef}
        initialViewState={{
          bounds: [
            [10.85, 49.88],
            [11.09, 50.27],
          ],
          fitBoundsOptions: { padding: 48 },
        }}
        mapStyle={mapStyles[resolvedTheme]}
        style={{ position: "absolute", inset: 0 }}
        onLoad={findLabelLayer}
        onStyleData={findLabelLayer}
      >
        {/* react-map-gl adds sources and layers again after a style swap. */}
        <Source id="demo-route" type="geojson" data={demoRoute}>
          <Layer
            id="demo-route-casing"
            beforeId={labelLayerId}
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": tokens.routeCasing, "line-width": 9 }}
          />
          <Layer
            id="demo-route-line"
            beforeId={labelLayerId}
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": tokens.route, "line-width": 5 }}
          />
        </Source>
        <Source id="demo-stops" type="geojson" data={demoStops}>
          <Layer
            id="demo-stops"
            beforeId={labelLayerId}
            type="circle"
            paint={{
              "circle-radius": 6,
              "circle-color": tokens.marker,
              "circle-stroke-color": tokens.surface,
              "circle-stroke-width": 2,
            }}
          />
        </Source>
      </MapGL>
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
      </div>
    </div>
  );
}
