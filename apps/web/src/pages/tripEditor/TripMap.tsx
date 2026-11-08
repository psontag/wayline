import {
  decodeLine,
  type LonLat,
  type Place,
  type Trip,
} from "@wayline/domain";
import {
  type Format,
  GhostViaMarker,
  HoverMarker,
  MapHint,
  PlaceBar,
  PlacePin,
  PreviewLabel,
  useFormat,
  useThemeTokens,
  ViaActions,
  ViaMarker,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Route } from "lucide-react";
import type { FilterSpecification } from "maplibre-gl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  Source,
} from "react-map-gl/maplibre";
import {
  AppMap,
  type AppMapProps,
  MapLayer,
  type MapPadding,
} from "../../components/map/AppMap";
import { isTyping, useLastPointer } from "../../components/useLastPointer";
import { nearestOnLine, useRouteDrag } from "../../components/useRouteDrag";
import type { MapHotel } from "./mapTypes";
import type { ViaPreview, ViaTarget } from "./routeEdits";
import type { MapStation } from "./stations";
import { TripMarkers } from "./TripMarkers";
import type { WeatherField } from "./weatherGrid";
import { WeatherLayers } from "./WeatherLayers";
import { type LiveVia, useViaPlacing, useViaPreview } from "./useViaPlacing";

export type { MapPadding };

const lineLayout = { "line-cap": "round", "line-join": "round" } as const;

export type MapAlternative = {
  place: Place;
  label: string;
  /** Places to sleep there, if known. */
  beds?: number;
};

export type TripMapProps = {
  trip: Trip;
  selected: number;
  /** Whole trip: every day at full strength, the hovered one stands out. */
  overview?: boolean;
  onSelect: (index: number) => void;
  /** Day under the pointer in the day list. */
  hovered?: number;
  /** Other towns for the selected stop. */
  alternatives?: MapAlternative[];
  onPickAlternative?: (place: Place) => void;
  /** Hotels near the end stop of the selected day. */
  hotels?: MapHotel[];
  selectedHotelId?: string;
  onSelectHotel?: (osmId: string) => void;
  /** Saves or unsaves a hotel. Without it, hotel cards have no save button. */
  onToggleSaveHotel?: (osmId: string) => void;
  /** Train stations along the trip. */
  stations?: MapStation[];
  /** Point that follows the elevation crosshair. */
  hover?: LonLat;
  /** Part of the route to show stronger, e.g. a hovered climb. */
  highlight?: LonLat[];
  /** Space around the trip when the map fits it, e.g. for a sheet. */
  padding?: MapPadding;
  /** Zoom buttons. Phones zoom with two fingers. */
  controls?: boolean;
  /** Overlays, e.g. a toast. */
  children?: ReactNode;
  /** Route edits of the selected stage. Without them, the route is fixed. */
  route?: RouteEditing;
  /** Rain and wind over the map, at one hour. */
  weather?: { field: WeatherField; rain: boolean; wind: boolean };
  /** Layers to turn on and off, in a menu under the zoom buttons. */
  layers?: AppMapProps["layers"];
  /** Signed cycling routes. */
  network?: AppMapProps["network"];
};

export type RouteEditing = {
  /** False while an edit is saved. */
  enabled: boolean;
  /** Route through a point while it is placed or dragged. Not saved. */
  preview: (target: ViaTarget, at: LonLat) => Promise<ViaPreview | undefined>;
  onAddVia: (leg: number, at: LonLat) => void;
  onMoveVia: (coord: LonLat, at: LonLat) => void;
  /** Called with true while a point is placed with the pin, e.g. to lower a sheet. */
  onPlacingChange?: (placing: boolean) => void;
  onRemoveVia: (coord: LonLat) => void;
  /** Via point of the selected stage that shows its actions. */
  selectedVia?: number;
  onSelectVia: (index: number | undefined) => void;
  /** Parts of the proposed route that differ, drawn as a soft grey line. */
  proposed: LonLat[][];
  /** Show the proposed route stronger. */
  proposedHighlighted?: boolean;
};

/** Trip on the map, days in the colors of the day list. The selected day is full strength. */
export function TripMap({
  trip,
  selected,
  overview = false,
  onSelect,
  hovered,
  alternatives = [],
  onPickAlternative,
  hotels = [],
  selectedHotelId,
  onSelectHotel,
  onToggleSaveHotel,
  stations = [],
  hover,
  highlight,
  padding,
  controls = true,
  children,
  route,
  weather,
  layers,
  network,
}: TripMapProps) {
  const { t } = useTranslation("tripEditor");
  const tokens = useThemeTokens();
  const mapRef = useRef<MapRef>(null);

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
          color: index % 2 ? tokens.stageB : tokens.stageA,
          selected: overview
            ? hovered === undefined || hovered === index
            : index === selected,
          hovered: index === hovered,
        },
        geometry: { type: "LineString", coordinates },
      })),
    }),
    [lines, selected, hovered, overview, tokens.stageA, tokens.stageB],
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
  // A mouse drags the line to add a via point. A finger taps it, because
  // a drag pans the map.
  const [pointer, pointerKind] = useLastPointer();
  const routeDrag = useRouteDrag({
    mapRef,
    lines: legLines,
    enabled: !!route?.enabled,
    pointer,
    onDrop: (leg, at) => route?.onAddVia(leg, at),
  });
  const { drag, ghost } = routeDrag;
  const ghostAt = drag?.at ?? ghost;

  // A via point dragged with the mouse.
  const [viaDrag, setViaDrag] = useState<LiveVia>();
  // A point placed with the pin, on touch.
  const placer = useViaPlacing(mapRef);
  const { placing } = placer;
  const lineDrag = useMemo<LiveVia | undefined>(
    () => drag && { target: { leg: drag.leg }, at: drag.at },
    [drag],
  );
  const mouseDrag = lineDrag ?? viaDrag;
  const live = mouseDrag ?? placing;
  const preview = useViaPreview(live, route?.preview);
  const previewData = useMemo<FeatureCollection<LineString>>(() => {
    const leg = drag && trip.stages[selected]?.legs[drag.leg];
    // Until the first route comes back, a line drag shows a straight line.
    const coordinates =
      preview?.line ?? (leg && drag ? [leg.from, drag.at, leg.to] : []);
    return {
      type: "FeatureCollection",
      features: coordinates.length
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates },
            },
          ]
        : [],
    };
  }, [preview, drag, trip.stages, selected]);
  const format = useFormat();
  const delta = preview && formatDelta(t, format, preview);
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
  // A via marker drag can end with a click on it. That must not select it.
  const draggedVia = useRef(false);

  const selectedVia = route?.selectedVia;
  const selectedCoord =
    selectedVia === undefined
      ? undefined
      : trip.stages[selected]?.via[selectedVia]?.coord;
  // The latest route edits, so the key handler does not go stale.
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });

  const isPlacing = !!placing;
  useEffect(() => {
    routeRef.current?.onPlacingChange?.(isPlacing);
  }, [isPlacing]);
  const stopPlacing = placer.stop;
  useEffect(() => {
    if (!isPlacing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") stopPlacing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPlacing, stopPlacing]);
  const finishPlacing = () => {
    if (!placing || !route) return;
    const { target, at } = placing;
    if ("leg" in target) route.onAddVia(target.leg, at);
    else route.onMoveVia(target.via, at);
    placer.stop();
  };
  useEffect(() => {
    if (!selectedCoord) return;
    const onKey = (event: KeyboardEvent) => {
      const edits = routeRef.current;
      if (!edits || isTyping(event.target)) return;
      if (event.key === "Escape") edits.onSelectVia(undefined);
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        edits.enabled
      ) {
        event.preventDefault();
        edits.onSelectVia(undefined);
        edits.onRemoveVia(selectedCoord);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCoord]);

  // Zoom to the stage when the selection changes, keeping its stop choices
  // and hotels in view. Not while the route is edited.
  const dragging = !!live;
  const fitTarget = overview ? -1 : selected;
  const [fitDay, setFitDay] = useState(fitTarget);
  if (!dragging && fitDay !== fitTarget) setFitDay(fitTarget);
  const fit = [
    ...(overview ? lines.flat() : (lines[selected] ?? [])),
    ...alternatives.map(({ place }) => place.coord),
    ...hotels.map((hotel) => hotel.coord),
  ];

  const first = trip.stages[0];
  const hiddenLabels = [
    ...(first ? [first.start.name] : []),
    ...trip.stages.map((stage) => stage.end.name),
    ...alternatives.map(({ place }) => place.name),
  ];

  const onClick = (event: MapLayerMouseEvent) => {
    const props = event.features?.[0]?.properties;
    const map = mapRef.current;
    // While placing, the map only moves.
    if (placing) return;
    // Clicks on markers also reach the map. A click on the map itself only
    // clears the selected via point, so a tap meant to close it adds nothing.
    if (selectedVia !== undefined && map) {
      if (event.originalEvent.target === map.getCanvas()) {
        route?.onSelectVia(undefined);
      }
      return;
    }
    if (
      typeof props?.leg === "number" &&
      pointer.current === "touch" &&
      route?.enabled
    ) {
      const line = legLines[props.leg];
      if (map && line) {
        placer.start({ leg: props.leg }, nearestOnLine(map, line, event.point));
      }
      return;
    }
    const index = props?.index;
    if (typeof index === "number") onSelect(index);
  };

  const isSelected: FilterSpecification = ["==", ["get", "selected"], true];
  const notSelected: FilterSpecification = ["==", ["get", "selected"], false];

  return (
    <AppMap
      label={t("map.label", { day: selected + 1 })}
      fit={fit}
      // Also when options show up or go, e.g. train stops for the last day.
      fitKey={[fitDay, alternatives.length > 0]}
      initialFit={lines.flat()}
      padding={padding}
      hiddenLabels={hiddenLabels}
      legend={
        route?.proposed.length
          ? [{ label: t("map.proposed"), line: "proposed" }]
          : []
      }
      controls={controls}
      layers={layers}
      network={network}
      hint={
        route &&
        pointerKind === "touch" && (
          <MapHint icon={<Route aria-hidden />}>
            {placing ? t("place.hint") : t("map.tapHint")}
          </MapHint>
        )
      }
      overlay={
        <>
          {children}
          {placing && (
            <div className="absolute inset-x-3 bottom-4 z-panel flex justify-center">
              <PlaceBar
                title={t("leg" in placing.target ? "place.add" : "place.move")}
                detail={delta}
                cancelLabel={t("place.cancel")}
                doneLabel={t("place.done")}
                busy={!route?.enabled}
                onCancel={placer.stop}
                onDone={finishPlacing}
              />
            </div>
          )}
        </>
      }
      mapRef={mapRef}
      interactiveLayerIds={["stage-hit", "leg-hit"]}
      cursor={drag ? "grabbing" : ghost ? "grab" : undefined}
      onClick={onClick}
      onMouseMove={routeDrag.onMouseMove}
      onMouseDown={routeDrag.onMouseDown}
      onMouseLeave={routeDrag.onMouseLeave}
    >
      {/* First, so it sits below the routes. */}
      {weather && <WeatherLayers {...weather} />}
      <Source id="proposed" type="geojson" data={proposedData}>
        <MapLayer
          id="proposed-line"
          type="line"
          layout={lineLayout}
          paint={{
            "line-color": tokens.proposed,
            "line-width": 8,
            "line-opacity": route?.proposedHighlighted ? 0.6 : 0.3,
          }}
        />
      </Source>
      <Source id="stages" type="geojson" data={data}>
        <MapLayer
          id="stage-line"
          type="line"
          filter={notSelected}
          layout={lineLayout}
          paint={{
            "line-color": ["get", "color"],
            "line-width": 5,
            "line-opacity": ["case", ["get", "hovered"], 0.85, 0.45],
          }}
        />
        <MapLayer
          id="selected-casing"
          type="line"
          filter={isSelected}
          layout={lineLayout}
          paint={{ "line-color": tokens.routeOutline, "line-width": 8 }}
        />
        <MapLayer
          id="selected-line"
          type="line"
          filter={isSelected}
          layout={lineLayout}
          paint={{ "line-color": ["get", "color"], "line-width": 5.5 }}
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
      {highlight && highlight.length > 1 && (
        <Source
          id="highlight"
          type="geojson"
          data={{
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: highlight },
          }}
        >
          <MapLayer
            id="highlight-halo"
            type="line"
            layout={lineLayout}
            paint={{ "line-color": tokens.surface, "line-width": 12 }}
          />
          <MapLayer
            id="highlight-line"
            type="line"
            layout={lineLayout}
            paint={{ "line-color": tokens.routeHighlight, "line-width": 6 }}
          />
        </Source>
      )}
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

      <TripMarkers
        trip={trip}
        selected={selected}
        overview={overview}
        onSelect={onSelect}
        alternatives={alternatives}
        onPickAlternative={onPickAlternative}
        stations={stations}
        hotels={hotels}
        selectedHotelId={selectedHotelId}
        onSelectHotel={onSelectHotel}
        onToggleSaveHotel={onToggleSaveHotel}
      />
      {route &&
        trip.stages[selected]?.via.map((via, index) => (
          <Marker
            // Index keys keep the marker while its point moves.
            key={index}
            longitude={via.coord[0]}
            latitude={via.coord[1]}
            // On touch, Move places it with the pin instead.
            draggable={route.enabled && pointerKind === "mouse" && !placing}
            onDragStart={() => (draggedVia.current = true)}
            onDrag={(e) =>
              setViaDrag({
                target: { via: via.coord },
                at: [e.lngLat.lng, e.lngLat.lat],
              })
            }
            onDragEnd={(e) => {
              setViaDrag(undefined);
              route.onMoveVia(via.coord, [e.lngLat.lng, e.lngLat.lat]);
              // The click, if any, comes right after the drag ends.
              setTimeout(() => (draggedVia.current = false));
            }}
            style={{ zIndex: 6 }}
          >
            <ViaMarker
              aria-label={t("map.via", { n: index + 1 })}
              selected={index === selectedVia}
              disabled={!route.enabled}
              onClick={() =>
                !draggedVia.current &&
                route.onSelectVia(index === selectedVia ? undefined : index)
              }
            />
          </Marker>
        ))}
      {route && selectedVia !== undefined && !placing && (
        <ViaActionsMarker
          route={route}
          via={trip.stages[selected]?.via[selectedVia]?.coord}
          n={selectedVia + 1}
          onMove={
            pointerKind === "touch"
              ? (coord) => {
                  route.onSelectVia(undefined);
                  placer.start({ via: coord }, coord);
                }
              : undefined
          }
        />
      )}
      {placing && (
        <Marker
          longitude={placing.at[0]}
          latitude={placing.at[1]}
          anchor="bottom"
          // The tip of the pin, not its bottom edge, marks the spot.
          offset={[0, 4]}
          style={{ zIndex: 8, pointerEvents: "none" }}
        >
          <PlacePin />
        </Marker>
      )}
      {mouseDrag && delta && (
        <Marker
          longitude={mouseDrag.at[0]}
          latitude={mouseDrag.at[1]}
          anchor="top-left"
          offset={[16, 16]}
          style={{ zIndex: 8, pointerEvents: "none" }}
        >
          <PreviewLabel>{delta}</PreviewLabel>
        </Marker>
      )}
      {ghostAt && (
        <Marker
          longitude={ghostAt[0]}
          latitude={ghostAt[1]}
          style={{ zIndex: 6, pointerEvents: "none" }}
        >
          <GhostViaMarker />
        </Marker>
      )}
      {hover && (
        <Marker longitude={hover[0]} latitude={hover[1]} style={{ zIndex: 6 }}>
          <HoverMarker />
        </Marker>
      )}
    </AppMap>
  );
}

/** Actions of the selected via point, above its marker. */
function ViaActionsMarker({
  route,
  via,
  n,
  onMove,
}: {
  route: RouteEditing;
  via: LonLat | undefined;
  n: number;
  onMove?: (coord: LonLat) => void;
}) {
  const { t } = useTranslation("tripEditor");
  if (!via) return null;
  return (
    <Marker
      longitude={via[0]}
      latitude={via[1]}
      anchor="bottom"
      // Clears the 44 px button of the via marker.
      offset={[0, -24]}
      style={{ zIndex: 7 }}
    >
      <ViaActions
        label={t("via.name", { n })}
        removeLabel={t("via.remove")}
        onRemove={() => {
          route.onSelectVia(undefined);
          route.onRemoveVia(via);
        }}
        moveLabel={t("via.move")}
        onMove={onMove && (() => onMove(via))}
      />
    </Marker>
  );
}

/** "+6 km · +120 m": how much longer and hillier the day gets. */
function formatDelta(
  t: TFunction<"tripEditor">,
  format: Format,
  { distance, ascent }: ViaPreview,
) {
  const signed = (value: number, text: string) =>
    t(value < 0 ? "place.less" : "place.more", { value: text });
  return t("place.delta", {
    distance: signed(distance, format.distance(Math.abs(distance))),
    ascent: signed(ascent, format.elevation(Math.abs(Math.round(ascent)))),
  });
}
