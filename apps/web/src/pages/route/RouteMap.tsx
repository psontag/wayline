import {
  decodeLine,
  distanceKm,
  type Leg,
  type LonLat,
  type Place,
} from "@wayline/domain";
import {
  EndpointMarker,
  GhostViaMarker,
  HoverMarker,
  IconButton,
  MapControlGroup,
  MapHint,
  MapLegend,
  useTheme,
  useThemeTokens,
  ViaMarker,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Minus, MousePointerClick, Plus } from "lucide-react";
import { type LngLatBoundsLike, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapGL, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  Source,
} from "react-map-gl/maplibre";
import { NetworkLayer } from "../../components/NetworkLayer";
import { useHiddenPlaceLabels } from "../../components/placeLabels";
import { useRouteDrag } from "./useRouteDrag";

setWorkerUrl(workerUrl);

const mapStyles = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const regionBounds: LngLatBoundsLike = [10.45, 49.59, 12.26, 50.52];

// Marker labels sit right of the point, so keep more room on that side.
const padding = { top: 64, right: 120, bottom: 48, left: 64 };

const lineLayout = { "line-cap": "round", "line-join": "round" } as const;

export type Endpoint = "from" | "to";

export type RouteMapProps = {
  from?: Place;
  to?: Place;
  via: LonLat[];
  legs?: Leg[];
  /** A new route is loading. The old one is shown faded. */
  updating?: boolean;
  /** Point that follows the elevation crosshair. */
  hover?: LonLat;
  /** Map clicks set this endpoint. */
  picking?: Endpoint;
  onPick: (endpoint: Endpoint, coord: LonLat) => void;
  /** A drop on leg i adds a via point between point i and i + 1. */
  onAddVia: (leg: number, coord: LonLat) => void;
  onMoveVia: (index: number, coord: LonLat) => void;
  onRemoveVia: (index: number) => void;
  /** Changes when the map should zoom to the endpoints. */
  fitKey: number;
};

function bounds(coords: LonLat[]): LngLatBoundsLike {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  // A single point gets some room around it.
  if (e - w < 0.02 && n - s < 0.02)
    return [w - 0.15, s - 0.1, e + 0.15, n + 0.1];
  return [w, s, e, n];
}

/**
 * Map of the route. Click to set the start and end, drag markers to move
 * them. Drag the line to add a via point, click a via point to remove it.
 */
export function RouteMap({
  from,
  to,
  via,
  legs,
  updating = false,
  hover,
  picking,
  onPick,
  onAddVia,
  onMoveVia,
  onRemoveVia,
  fitKey,
}: RouteMapProps) {
  const { t } = useTranslation("route");
  const { resolvedTheme } = useTheme();
  const tokens = useThemeTokens();
  const mapRef = useRef<MapRef>(null);
  const [labelLayerId, setLabelLayerId] = useState<string>();
  // A marker drag can end with a click on the marker. It must not remove.
  const draggedVia = useRef(false);

  const lines = useMemo(
    () => (legs ?? []).map((leg) => decodeLine(leg.geometry)),
    [legs],
  );
  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: lines.map((coordinates, index) => ({
        type: "Feature",
        properties: { leg: index },
        geometry: { type: "LineString", coordinates },
      })),
    }),
    [lines],
  );

  const points = from && to ? [from.coord, ...via, to.coord] : ([] as LonLat[]);
  const routeDrag = useRouteDrag({
    mapRef,
    lines,
    // The old route is faded while a new one loads. Its legs may not match
    // the points any more.
    enabled: !updating && !picking && lines.length === points.length - 1,
    onDrop: onAddVia,
  });
  const { drag, ghost } = routeDrag;
  const ghostAt = drag?.at ?? ghost;
  const preview = useMemo<FeatureCollection<LineString>>(() => {
    const a = drag && points[drag.leg];
    const b = drag && points[drag.leg + 1];
    return {
      type: "FeatureCollection",
      features:
        drag && a && b
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [a, drag.at, b] },
              },
            ]
          : [],
    };
    // points is new on every render; drag changes with every move anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const ends = [from, to].filter((p): p is Place => !!p);
  const hideLabels = useHiddenPlaceLabels(
    mapRef,
    ends.filter((p) => p.kind !== "custom").map((p) => p.name),
  );

  // Our layers go below the first label layer, so place names stay readable.
  const onStyle = () => {
    const layers = mapRef.current?.getStyle()?.layers ?? [];
    setLabelLayerId(layers.find((layer) => layer.type === "symbol")?.id);
    hideLabels();
  };

  // Zoom to the route once it is there: on first load and after a search
  // pick. Clicks and drags keep the view.
  const fitPending = useRef(ends.length > 0);
  const fitSeen = useRef(fitKey);
  const endsKey = JSON.stringify(ends.map((p) => p.coord));
  useEffect(() => {
    if (fitSeen.current !== fitKey) {
      fitSeen.current = fitKey;
      fitPending.current = true;
    }
    if (!fitPending.current || updating) return;
    const ends: LonLat[] = JSON.parse(endsKey);
    const line = data.features.flatMap((f) => f.geometry.coordinates);
    const [first, last] = [line[0], line.at(-1)];
    const lineMatches =
      ends.length === 2 &&
      first &&
      last &&
      distanceKm(first as LonLat, ends[0] as LonLat) < 1 &&
      distanceKm(last as LonLat, ends[1] as LonLat) < 1;
    const coords = ends.length < 2 ? ends : lineMatches ? line : [];
    if (!coords.length) return;
    fitPending.current = false;
    mapRef.current?.fitBounds(bounds(coords as LonLat[]), {
      padding,
      maxZoom: 12,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 600,
    });
  }, [fitKey, data, updating, endsKey]);

  const onClick = (event: MapLayerMouseEvent) => {
    if (picking) onPick(picking, [event.lngLat.lng, event.lngLat.lat]);
  };

  const endpoint = (which: Endpoint, place: Place | undefined) =>
    place && (
      <Marker
        longitude={place.coord[0]}
        latitude={place.coord[1]}
        anchor="left"
        offset={[-12, 0]}
        draggable
        onDragEnd={(e) => onPick(which, [e.lngLat.lng, e.lngLat.lat])}
        style={{ cursor: "grab", zIndex: 2 }}
      >
        <EndpointMarker name={place.name} station={place.kind === "station"} />
      </Marker>
    );

  const fromMarker = endpoint("from", from);
  const toMarker = endpoint("to", to);

  return (
    <div className="absolute inset-0" role="region" aria-label={t("map.label")}>
      <MapGL
        ref={mapRef}
        initialViewState={{
          bounds: ends.length ? bounds(ends.map((p) => p.coord)) : regionBounds,
          fitBoundsOptions: { padding },
        }}
        mapStyle={mapStyles[resolvedTheme]}
        style={{ position: "absolute", inset: "0" }}
        onLoad={onStyle}
        onStyleData={onStyle}
        onClick={onClick}
        interactiveLayerIds={["route-hit"]}
        onMouseMove={routeDrag.onMouseMove}
        onMouseDown={routeDrag.onMouseDown}
        onMouseLeave={routeDrag.onMouseLeave}
        cursor={
          picking ? "crosshair" : drag ? "grabbing" : ghost ? "grab" : undefined
        }
      >
        <Source id="route" type="geojson" data={data}>
          <Layer
            id="route-casing"
            beforeId={labelLayerId}
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.routeCasing,
              "line-width": 11,
              "line-opacity": updating ? 0.4 : 1,
            }}
          />
          <Layer
            id="route-line"
            beforeId={labelLayerId}
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.route,
              "line-width": 7,
              "line-opacity": updating ? 0.5 : 1,
            }}
          />
          <Layer
            id="route-hit"
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.route,
              "line-width": 20,
              "line-opacity": 0,
            }}
          />
        </Source>
        <Source id="drag-preview" type="geojson" data={preview}>
          <Layer
            id="drag-preview"
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.viaPoint,
              "line-width": 3,
              "line-dasharray": [1, 2],
            }}
          />
        </Source>
        <NetworkLayer beforeId="route-casing" />

        {fromMarker}
        {toMarker}
        {via.map((coord, index) => (
          <Marker
            // Index keys keep the marker while its point moves.
            key={index}
            longitude={coord[0]}
            latitude={coord[1]}
            draggable
            onDragStart={() => (draggedVia.current = true)}
            onDragEnd={(e) => {
              onMoveVia(index, [e.lngLat.lng, e.lngLat.lat]);
              // The click, if any, comes right after the drag ends.
              setTimeout(() => (draggedVia.current = false));
            }}
            style={{ zIndex: 2 }}
          >
            <ViaMarker
              aria-label={t("via.remove", { n: index + 1 })}
              onClick={() => !draggedVia.current && onRemoveVia(index)}
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
      {picking && (
        <div className="pointer-events-none absolute inset-x-4 top-3 z-panel flex justify-center">
          <MapHint icon={<MousePointerClick aria-hidden />}>
            {t(picking === "from" ? "map.pickStart" : "map.pickEnd")}
          </MapHint>
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-panel">
        <MapLegend items={[{ label: t("map.network"), line: "network" }]} />
      </div>
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
    </div>
  );
}
