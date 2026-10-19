import {
  decodeLine,
  type LonLat,
  type Place,
  type Trip,
} from "@wayline/domain";
import {
  AlternativeMarker,
  EndpointMarker,
  HoverMarker,
  IconButton,
  MapControlGroup,
  StopMarker,
  useTheme,
  useThemeTokens,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Minus, Plus } from "lucide-react";
import {
  type FilterSpecification,
  type LngLatBoundsLike,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  Source,
} from "react-map-gl/maplibre";

// MapLibre finds its worker next to its own module. Vite moves both.
setWorkerUrl(workerUrl);

const mapStyles = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export type MapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

// Marker labels sit right of the point, so keep more room on that side.
const defaultPadding: MapPadding = {
  top: 56,
  right: 120,
  bottom: 40,
  left: 56,
};

const lineLayout = { "line-cap": "round", "line-join": "round" } as const;

export type MapAlternative = { place: Place; label: string };

export type TripMapProps = {
  trip: Trip;
  selected: number;
  onSelect: (index: number) => void;
  /** Other towns for the selected stop. */
  alternatives?: MapAlternative[];
  onPickAlternative?: (place: Place) => void;
  /** Point that follows the elevation crosshair. */
  hover?: LonLat;
  /** Space around the trip when the map fits it, e.g. for a sheet. */
  padding?: MapPadding;
  /** Zoom buttons. Phones zoom with two fingers. */
  controls?: boolean;
  /** Overlays, e.g. a toast. */
  children?: ReactNode;
};

function bounds(coords: LonLat[]): LngLatBoundsLike {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

/** Trip on the map. Stages alternate in color; the selected one stands out. */
export function TripMap({
  trip,
  selected,
  onSelect,
  alternatives = [],
  onPickAlternative,
  hover,
  padding = defaultPadding,
  controls = true,
  children,
}: TripMapProps) {
  const { t } = useTranslation("tripEditor");
  const { resolvedTheme } = useTheme();
  const tokens = useThemeTokens();
  const mapRef = useRef<MapRef>(null);
  const [labelLayerId, setLabelLayerId] = useState<string>();
  const [cursor, setCursor] = useState<string>();

  const lines = useMemo(
    () =>
      trip.stages.map((stage) =>
        stage.legs.flatMap((leg) => decodeLine(leg.geometry)),
      ),
    [trip.stages],
  );

  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: lines.map((coordinates, index) => ({
        type: "Feature",
        properties: {
          index,
          color: index % 2 ? "b" : "a",
          selected: index === selected,
        },
        geometry: { type: "LineString", coordinates },
      })),
    }),
    [lines, selected],
  );

  // Zoom to the stage when the selection changes, not on first load.
  const shown = useRef(selected);
  useEffect(() => {
    if (shown.current === selected) return;
    shown.current = selected;
    const line = lines[selected];
    if (line?.length) {
      mapRef.current?.fitBounds(bounds(line), {
        padding,
        maxZoom: 12,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 600,
      });
    }
  }, [selected, lines, padding]);

  // Our layers go below the first label layer, so place names stay readable.
  const findLabelLayer = () => {
    const layers = mapRef.current?.getStyle()?.layers ?? [];
    setLabelLayerId(layers.find((layer) => layer.type === "symbol")?.id);
  };

  const onClick = (event: MapLayerMouseEvent) => {
    const index = event.features?.[0]?.properties?.index;
    if (typeof index === "number") onSelect(index);
  };

  const first = trip.stages[0];
  const last = trip.stages.at(-1);
  const isSelected: FilterSpecification = ["==", ["get", "selected"], true];
  const notSelected: FilterSpecification = ["==", ["get", "selected"], false];

  return (
    <div
      className="absolute inset-0"
      role="region"
      aria-label={t("map.label", { day: selected + 1 })}
    >
      <MapGL
        ref={mapRef}
        initialViewState={{
          bounds: bounds(lines.flat()),
          fitBoundsOptions: { padding },
        }}
        mapStyle={mapStyles[resolvedTheme]}
        style={{ position: "absolute", inset: "0" }}
        onLoad={findLabelLayer}
        onStyleData={findLabelLayer}
        interactiveLayerIds={["stage-hit"]}
        onClick={onClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor(undefined)}
        cursor={cursor}
      >
        <Source id="stages" type="geojson" data={data}>
          <Layer
            id="stage-casing"
            beforeId={labelLayerId}
            type="line"
            filter={notSelected}
            layout={lineLayout}
            paint={{ "line-color": tokens.surface, "line-width": 8 }}
          />
          <Layer
            id="stage-line"
            beforeId={labelLayerId}
            type="line"
            filter={notSelected}
            layout={lineLayout}
            paint={{
              "line-color": [
                "match",
                ["get", "color"],
                "a",
                tokens.stageA,
                tokens.stageB,
              ],
              "line-width": 5,
            }}
          />
          <Layer
            id="selected-casing"
            beforeId={labelLayerId}
            type="line"
            filter={isSelected}
            layout={lineLayout}
            paint={{ "line-color": tokens.routeCasing, "line-width": 11 }}
          />
          <Layer
            id="selected-line"
            beforeId={labelLayerId}
            type="line"
            filter={isSelected}
            layout={lineLayout}
            paint={{ "line-color": tokens.routeSelected, "line-width": 7 }}
          />
          <Layer
            id="stage-hit"
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.route,
              "line-width": 18,
              "line-opacity": 0,
            }}
          />
        </Source>

        {first && (
          <Marker
            longitude={first.start.coord[0]}
            latitude={first.start.coord[1]}
            anchor="left"
            offset={[-12, 0]}
          >
            <EndpointMarker
              name={first.start.name}
              station={first.start.kind === "station"}
            />
          </Marker>
        )}
        {last && (
          <Marker
            longitude={last.end.coord[0]}
            latitude={last.end.coord[1]}
            anchor="left"
            offset={[-12, 0]}
          >
            <EndpointMarker
              name={last.end.name}
              station={last.end.kind === "station"}
            />
          </Marker>
        )}
        {alternatives.map(({ place, label }) => (
          <Marker
            key={place.name}
            longitude={place.coord[0]}
            latitude={place.coord[1]}
            anchor="left"
            offset={[-8, 0]}
          >
            <AlternativeMarker
              label={label}
              onClick={() => onPickAlternative?.(place)}
            />
          </Marker>
        ))}
        {trip.stages.slice(0, -1).map((stage, index) => (
          <Marker
            key={stage.id}
            longitude={stage.end.coord[0]}
            latitude={stage.end.coord[1]}
            anchor="left"
            offset={[-14, 0]}
            style={{ zIndex: index === selected ? 2 : 1 }}
          >
            <StopMarker
              day={index + 1}
              name={stage.end.name}
              selected={index === selected}
              aria-label={t("map.selectStage", {
                day: index + 1,
                place: stage.end.name,
              })}
              onClick={() => onSelect(index)}
            />
          </Marker>
        ))}
        {hover && (
          <Marker
            longitude={hover[0]}
            latitude={hover[1]}
            style={{ zIndex: 3 }}
          >
            <HoverMarker />
          </Marker>
        )}
      </MapGL>
      {controls && (
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
      )}
      {children}
    </div>
  );
}
