import { useQuery } from "@tanstack/react-query";
import type { Place } from "@wayline/domain";
import {
  IconButton,
  MapControlGroup,
  MapLegend,
  PlaceMarker,
  useTheme,
  useThemeTokens,
} from "@wayline/ui";
import type { FeatureCollection, Polygon } from "geojson";
import { Minus, Plus } from "lucide-react";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapGL, {
  Layer,
  Marker,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { NetworkLayer } from "../../components/NetworkLayer";
import { useHiddenPlaceLabels } from "../../components/placeLabels";
import { useServices } from "../../data/ServicesProvider";

setWorkerUrl(workerUrl);

const mapStyles = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

type Bounds = [[number, number], [number, number]];

/** The area the test network covers. */
function useNetworkArea() {
  const { network } = useServices();
  return useQuery({
    queryKey: ["newTrip", "networkArea"],
    staleTime: Infinity,
    queryFn: async (): Promise<FeatureCollection<Polygon>> => {
      const [w, s, e, n] = (await network.manifest()).region.bbox;
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [w, s],
                  [e, s],
                  [e, n],
                  [w, n],
                  [w, s],
                ],
              ],
            },
          },
        ],
      };
    },
  });
}

function boundsOf(places: Place[]): Bounds | undefined {
  if (places.length === 0) return;
  const lons = places.map((p) => p.coord[0]);
  const lats = places.map((p) => p.coord[1]);
  // Pad a single place, so the map does not zoom in all the way.
  const pad = places.length === 1 ? 0.25 : 0.05;
  return [
    [Math.min(...lons) - pad, Math.min(...lats) - pad],
    [Math.max(...lons) + pad, Math.max(...lats) + pad],
  ];
}

const regionBounds: Bounds = [
  [10.45, 49.59],
  [12.26, 50.52],
];

export function NewTripMap({
  start,
  end,
}: {
  start: Place | null;
  end: Place | null;
}) {
  const { t } = useTranslation("newTrip");
  const { resolvedTheme } = useTheme();
  const tokens = useThemeTokens();
  const mapRef = useRef<MapRef>(null);
  const area = useNetworkArea();
  const [labelLayerId, setLabelLayerId] = useState<string>();
  const places = [start, end].filter((p): p is Place => p !== null);
  const hideLabels = useHiddenPlaceLabels(
    mapRef,
    places.map((p) => p.name),
  );
  const onStyle = () => {
    const layers = mapRef.current?.getStyle()?.layers ?? [];
    setLabelLayerId(layers.find((l) => l.type === "symbol")?.id);
    hideLabels();
  };

  const bounds = boundsOf(places);
  const boundsKey = JSON.stringify(bounds);
  useEffect(() => {
    if (bounds)
      mapRef.current?.fitBounds(bounds, { padding: 80, duration: 600 });
    // boundsKey stands for bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  return (
    <div className="absolute inset-0" role="region" aria-label={t("map.label")}>
      <MapGL
        ref={mapRef}
        initialViewState={{
          bounds: bounds ?? regionBounds,
          fitBoundsOptions: { padding: 80 },
        }}
        mapStyle={mapStyles[resolvedTheme]}
        style={{ position: "absolute", inset: 0 }}
        onLoad={onStyle}
        onStyleData={onStyle}
      >
        <NetworkLayer beforeId={labelLayerId} />
        {area.data && (
          <Source id="area" type="geojson" data={area.data}>
            <Layer
              id="area-outline"
              beforeId={labelLayerId}
              type="line"
              paint={{
                "line-color": tokens.textMuted,
                "line-width": 1.5,
                "line-dasharray": [4, 3],
              }}
            />
          </Source>
        )}
        {places.map((place) => (
          <Marker
            key={place.name + place.coord.join()}
            longitude={place.coord[0]}
            latitude={place.coord[1]}
            anchor="left"
            offset={[-6, 0]}
          >
            <PlaceMarker name={place.name} />
          </Marker>
        ))}
      </MapGL>
      <div className="absolute top-3 right-3 z-panel">
        <MapControlGroup>
          <IconButton
            label={t("map.zoomIn")}
            icon={<Plus aria-hidden />}
            size="sm"
            onClick={() => mapRef.current?.zoomIn()}
          />
          <IconButton
            label={t("map.zoomOut")}
            icon={<Minus aria-hidden />}
            size="sm"
            onClick={() => mapRef.current?.zoomOut()}
          />
        </MapControlGroup>
      </div>
      <div className="absolute bottom-3 left-3 z-panel">
        <MapLegend
          items={[
            { label: t("map.network"), line: "network" },
            { label: t("map.area"), line: "dashed" },
          ]}
        />
      </div>
    </div>
  );
}
