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
  HotelMarker,
  HoverMarker,
  MapHint,
  StopMarker,
  useThemeTokens,
  ViaMarker,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Route } from "lucide-react";
import type { FilterSpecification } from "maplibre-gl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  Source,
} from "react-map-gl/maplibre";
import { AppMap, MapLayer, type MapPadding } from "../../components/map/AppMap";
import {
  nearestOnLine,
  type RouteDrag,
  useRouteDrag,
} from "../../components/useRouteDrag";
import type { MapHotel } from "./mapTypes";
import { tripStops } from "./tripArea";

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
  /** keep: add it even if the route stays the same, as a handle. */
  onAddVia: (leg: number, at: LonLat, keep?: boolean) => void;
  onMoveVia: (coord: LonLat, at: LonLat) => void;
  onRemoveVia: (coord: LonLat) => void;
  /** Proposed routes of changed stages, drawn dotted. */
  proposed: LonLat[][];
};

/** Waits this long after the last move before a preview is routed. */
const PREVIEW_MS = 120;

/** Trip on the map in one color. The selected day is full strength. */
export function TripMap({
  trip,
  selected,
  onSelect,
  hovered,
  alternatives = [],
  onPickAlternative,
  hotels = [],
  selectedHotelId,
  onSelectHotel,
  hover,
  padding,
  controls = true,
  children,
  route,
}: TripMapProps) {
  const { t } = useTranslation("tripEditor");
  const tokens = useThemeTokens();
  const mapRef = useRef<MapRef>(null);
  const [activeHotel, setActiveHotel] = useState<string>();

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
          selected: index === selected,
          hovered: index === hovered,
        },
        geometry: { type: "LineString", coordinates },
      })),
    }),
    [lines, selected, hovered],
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

  // Zoom to the stage when the selection changes, keeping its stop choices
  // and hotels in view. Not while the route is dragged.
  const dragging = !!drag;
  const [fitDay, setFitDay] = useState(selected);
  if (!dragging && fitDay !== selected) setFitDay(selected);
  const fit = [
    ...(lines[selected] ?? []),
    ...alternatives.map(({ place }) => place.coord),
    ...hotels.map((hotel) => hotel.coord),
  ];

  const first = trip.stages[0];
  const last = trip.stages.at(-1);
  const hiddenLabels = [
    ...(first ? [first.start.name] : []),
    ...trip.stages.map((stage) => stage.end.name),
    ...alternatives.map(({ place }) => place.name),
  ];

  const onClick = (event: MapLayerMouseEvent) => {
    const props = event.features?.[0]?.properties;
    const map = mapRef.current;
    if (typeof props?.leg === "number" && route?.tapToAdd && route.enabled) {
      const line = legLines[props.leg];
      if (map && line) {
        route.onAddVia(props.leg, nearestOnLine(map, line, event.point), true);
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
      fitKey={fitDay}
      initialFit={lines.flat()}
      padding={padding}
      networkAround={tripStops(trip)}
      hiddenLabels={hiddenLabels}
      legend={
        route?.proposed.length
          ? [{ label: t("map.proposed"), line: "dashed" }]
          : []
      }
      controls={controls}
      hint={
        route && (
          <MapHint icon={<Route aria-hidden />}>
            {t(route.tapToAdd ? "map.tapHint" : "map.dragHint")}
          </MapHint>
        )
      }
      overlay={children}
      mapRef={mapRef}
      interactiveLayerIds={["stage-hit", "leg-hit"]}
      cursor={drag ? "grabbing" : ghost ? "grab" : undefined}
      onClick={onClick}
      onMouseMove={routeDrag.onMouseMove}
      onMouseDown={routeDrag.onMouseDown}
      onMouseLeave={routeDrag.onMouseLeave}
    >
      <Source id="proposed" type="geojson" data={proposedData}>
        <MapLayer
          id="proposed-line"
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
        <MapLayer
          id="stage-line"
          type="line"
          filter={notSelected}
          layout={lineLayout}
          paint={{
            "line-color": tokens.routeSelected,
            "line-width": 5,
            "line-opacity": ["case", ["get", "hovered"], 0.85, 0.45],
          }}
        />
        <MapLayer
          id="selected-casing"
          type="line"
          filter={isSelected}
          layout={lineLayout}
          paint={{ "line-color": tokens.routeOutline, "line-width": 10 }}
        />
        <MapLayer
          id="selected-line"
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
      {alternatives.map(({ place, label, beds }) => (
        <Marker
          key={place.name}
          longitude={place.coord[0]}
          latitude={place.coord[1]}
          anchor="left"
          offset={[-8, 0]}
        >
          <AlternativeMarker
            label={label}
            beds={beds}
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
          // Center the circle on the stop. It is larger when selected.
          offset={[index === selected ? -20 : -16, 0]}
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
      {hotels.map((hotel) => (
        <Marker
          key={hotel.osmId}
          longitude={hotel.coord[0]}
          latitude={hotel.coord[1]}
          style={{
            zIndex:
              activeHotel === hotel.osmId
                ? 4
                : hotel.osmId === selectedHotelId
                  ? 2
                  : 1,
          }}
        >
          <HotelMarker
            name={hotel.name}
            kind={hotel.kind}
            stars={hotel.stars}
            detour={hotel.detourKm * 1000}
            website={hotel.website}
            selected={hotel.osmId === selectedHotelId}
            onClick={() => onSelectHotel?.(hotel.osmId)}
            onActiveChange={(active) =>
              setActiveHotel((id) =>
                active ? hotel.osmId : id === hotel.osmId ? undefined : id,
              )
            }
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
        <Marker longitude={hover[0]} latitude={hover[1]} style={{ zIndex: 3 }}>
          <HoverMarker />
        </Marker>
      )}
    </AppMap>
  );
}
