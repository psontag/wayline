import {
  decodeLine,
  type LonLat,
  type Place,
  type Trip,
} from "@wayline/domain";
import {
  AlternativeMarker,
  EndpointMarker,
  GhostViaMarker,
  HoverMarker,
  IconButton,
  MapControlGroup,
  MapHint,
  MapLegend,
  StopMarker,
  useTheme,
  useThemeTokens,
  ViaMarker,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Minus, Plus, Route } from "lucide-react";
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
import { NetworkLayer } from "../../components/NetworkLayer";
import {
  nearestOnLine,
  type RouteDrag,
  useRouteDrag,
} from "../../components/useRouteDrag";
import { tripStops } from "./tripArea";
import { useHiddenPlaceLabels } from "../../components/placeLabels";

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
  /** Route edits of the selected stage. Without them, the route is fixed. */
  route?: RouteEditing;
};

export type RouteEditing = {
  /** False while an edit is saved. */
  enabled: boolean;
  /** Tap the line to add a via point. For touch, where a drag pans. */
  tapToAdd?: boolean;
  /** Route of a leg through a point, while the point is dragged. */
  preview: (leg: number, at: LonLat) => Promise<LonLat[]>;
  onAddVia: (leg: number, at: LonLat) => void;
  onMoveVia: (coord: LonLat, at: LonLat) => void;
  onRemoveVia: (coord: LonLat) => void;
  /** Proposed routes of changed stages, drawn dotted. */
  proposed: LonLat[][];
};

/** Waits this long after the last move before a preview is routed. */
const PREVIEW_MS = 120;

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
  route,
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

  // Legs of the selected stage, to drag the route.
  const legLines = useMemo(
    () =>
      (trip.stages[selected]?.legs ?? []).map((leg) =>
        decodeLine(leg.geometry),
      ),
    [trip.stages, selected],
  );
  const legData = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: legLines.map((coordinates, leg) => ({
        type: "Feature",
        properties: { leg },
        geometry: { type: "LineString", coordinates },
      })),
    }),
    [legLines],
  );
  const routeDrag = useRouteDrag({
    mapRef,
    lines: legLines,
    enabled: !!route?.enabled && !route.tapToAdd,
    onDrop: (leg, at) => route?.onAddVia(leg, at),
  });
  const { drag, ghost } = routeDrag;
  const ghostAt = drag?.at ?? ghost;

  // The route through the dragged point, routed shortly after each move.
  // It belongs to one drag position and is ignored for any other.
  const [routed, setRouted] = useState<{ drag: RouteDrag; line: LonLat[] }>();
  // The latest preview function, so a new one does not restart the timer.
  const previewFn = useRef(route?.preview);
  useEffect(() => {
    previewFn.current = route?.preview;
  });
  useEffect(() => {
    if (!drag) return;
    let stale = false;
    const timer = setTimeout(() => {
      void previewFn.current?.(drag.leg, drag.at).then((line) => {
        if (!stale) setRouted({ drag, line });
      });
    }, PREVIEW_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [drag]);
  const previewData = useMemo<FeatureCollection<LineString>>(() => {
    const preview = routed && routed.drag === drag ? routed.line : [];
    const points = trip.stages[selected]?.legs ?? [];
    const leg = drag && points[drag.leg];
    const coordinates = preview.length
      ? preview
      : leg && drag
        ? [leg.from, drag.at, leg.to]
        : [];
    return {
      type: "FeatureCollection",
      features: coordinates.length
        ? [
            {
              type: "Feature",
              properties: { routed: preview.length > 0 },
              geometry: { type: "LineString", coordinates },
            },
          ]
        : [],
    };
  }, [routed, drag, trip.stages, selected]);
  const proposedData = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: (route?.proposed ?? []).map((coordinates) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      })),
    }),
    [route?.proposed],
  );
  // A via marker drag can end with a click on it. That must not remove it.
  const draggedVia = useRef(false);

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

  const first = trip.stages[0];
  const last = trip.stages.at(-1);
  const hideLabels = useHiddenPlaceLabels(mapRef, [
    ...(first ? [first.start.name] : []),
    ...trip.stages.map((stage) => stage.end.name),
    ...alternatives.map(({ place }) => place.name),
  ]);

  // Our layers go below the first label layer, so place names stay readable.
  const onStyle = () => {
    const layers = mapRef.current?.getStyle()?.layers ?? [];
    setLabelLayerId(layers.find((layer) => layer.type === "symbol")?.id);
    hideLabels();
  };

  const onClick = (event: MapLayerMouseEvent) => {
    const props = event.features?.[0]?.properties;
    const map = mapRef.current;
    if (typeof props?.leg === "number" && route?.tapToAdd && route.enabled) {
      const line = legLines[props.leg];
      if (map && line) {
        route.onAddVia(props.leg, nearestOnLine(map, line, event.point));
      }
      return;
    }
    const index = props?.index;
    if (typeof index === "number") onSelect(index);
  };

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
        onLoad={onStyle}
        onStyleData={onStyle}
        interactiveLayerIds={["stage-hit", "leg-hit"]}
        onClick={onClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => {
          setCursor(undefined);
          routeDrag.onMouseLeave();
        }}
        onMouseMove={routeDrag.onMouseMove}
        onMouseDown={routeDrag.onMouseDown}
        cursor={drag ? "grabbing" : ghost ? "grab" : cursor}
      >
        <Source id="proposed" type="geojson" data={proposedData}>
          <Layer
            id="proposed-line"
            beforeId={labelLayerId}
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.textMuted,
              "line-width": 4,
              "line-dasharray": [0.5, 2],
            }}
          />
        </Source>
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
        <Source id="legs" type="geojson" data={legData}>
          <Layer
            id="leg-hit"
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.route,
              "line-width": 20,
              "line-opacity": 0,
            }}
          />
        </Source>
        <Source id="drag-preview" type="geojson" data={previewData}>
          <Layer
            id="drag-preview"
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.viaPoint,
              "line-width": 4,
              "line-dasharray": [1, 1.5],
            }}
          />
        </Source>
        <NetworkLayer around={tripStops(trip)} beforeId="proposed-line" />

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
        {route &&
          trip.stages[selected]?.via.map((via, index) => (
            <Marker
              // Index keys keep the marker while its point moves.
              key={index}
              longitude={via.coord[0]}
              latitude={via.coord[1]}
              draggable={route.enabled}
              onDragStart={() => (draggedVia.current = true)}
              onDragEnd={(e) => {
                route.onMoveVia(via.coord, [e.lngLat.lng, e.lngLat.lat]);
                // The click, if any, comes right after the drag ends.
                setTimeout(() => (draggedVia.current = false));
              }}
              style={{ zIndex: 3 }}
            >
              <ViaMarker
                aria-label={t("map.removeVia", { n: index + 1 })}
                disabled={!route.enabled}
                onClick={() =>
                  !draggedVia.current && route.onRemoveVia(via.coord)
                }
              />
            </Marker>
          ))}
        {ghostAt && (
          <Marker
            longitude={ghostAt[0]}
            latitude={ghostAt[1]}
            style={{ zIndex: 3, pointerEvents: "none" }}
          >
            <GhostViaMarker />
          </Marker>
        )}
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
        <div className="absolute bottom-3 left-3 z-panel">
          <MapLegend
            items={[
              { label: t("map.network"), line: "network" },
              ...(route?.proposed.length
                ? [{ label: t("map.proposed"), line: "dashed" as const }]
                : []),
            ]}
          />
        </div>
      )}
      {route && (
        <div className="pointer-events-none absolute top-3 left-3 z-panel">
          <MapHint icon={<Route aria-hidden />}>
            {t(route.tapToAdd ? "map.tapHint" : "map.dragHint")}
          </MapHint>
        </div>
      )}
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
