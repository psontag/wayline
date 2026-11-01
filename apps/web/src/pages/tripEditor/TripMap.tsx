import {
  decodeLine,
  type LonLat,
  type Place,
  type Trip,
} from "@wayline/domain";
import {
  AlternativeMarker,
  ClusterMarker,
  EndpointMarker,
  GhostViaMarker,
  HotelMarker,
  HoverMarker,
  MapHint,
  StationMarker,
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
  useMap,
} from "react-map-gl/maplibre";
import {
  AppMap,
  type AppMapProps,
  boundsOf,
  MapLayer,
  type MapPadding,
} from "../../components/map/AppMap";
import { clusterPoints } from "../../components/map/cluster";
import {
  nearestOnLine,
  type RouteDrag,
  useRouteDrag,
} from "../../components/useRouteDrag";
import { useSiteInfo } from "../../data/queries";
import { hotelBookingUrl } from "./BookingLink";
import type { MapHotel } from "./mapTypes";
import type { MapStation } from "./stations";
import type { WeatherField } from "./weatherGrid";
import { WeatherLayers } from "./WeatherLayers";

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

/** Stations show from this zoom on, so the whole trip stays calm. */
const STATION_ZOOM = 10;

/** Below this zoom, hotels and stations close together show as one. */
const CLUSTER_ZOOM = 13;
/** Screen distance in pixels within which places join a cluster. */
const CLUSTER_RADIUS = 36;

/** Waits this long after the last move before a preview is routed. */
const PREVIEW_MS = 120;

/** Trip on the map in one color. The selected day is full strength. */
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
  const [activeHotel, setActiveHotel] = useState<string>();
  const activeSite = useSiteInfo(
    hotels.find((h) => h.osmId === activeHotel)?.website,
  );
  // Full hotel markers crowd the stop labels until zoomed in.
  const [zoom, setZoom] = useState(0);

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
          selected: overview
            ? hovered === undefined || hovered === index
            : index === selected,
          hovered: index === hovered,
        },
        geometry: { type: "LineString", coordinates },
      })),
    }),
    [lines, selected, hovered, overview],
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
  const fitTarget = overview ? -1 : selected;
  const [fitDay, setFitDay] = useState(fitTarget);
  if (!dragging && fitDay !== fitTarget) setFitDay(fitTarget);
  const fit = [
    ...(overview ? lines.flat() : (lines[selected] ?? [])),
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
      hiddenLabels={hiddenLabels}
      legend={
        route?.proposed.length
          ? [{ label: t("map.proposed"), line: "dashed" }]
          : []
      }
      controls={controls}
      layers={layers}
      network={network}
      hint={
        route?.tapToAdd && (
          <MapHint icon={<Route aria-hidden />}>{t("map.tapHint")}</MapHint>
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
      onZoomEnd={setZoom}
    >
      {/* First, so it sits below the routes. */}
      {weather && <WeatherLayers {...weather} />}
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
            id="highlight-line"
            type="line"
            layout={lineLayout}
            paint={{ "line-color": tokens.viaPoint, "line-width": 9 }}
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
      <ClusteredMarkers
        kind="stations"
        items={zoom >= STATION_ZOOM ? stations : noStations}
        render={(station) => (
          <Marker
            key={station.id}
            longitude={station.coord[0]}
            latitude={station.coord[1]}
            style={{ zIndex: 1 }}
          >
            <StationMarker name={station.name} href={station.href} />
          </Marker>
        )}
      />
      <AlternativeMarkers
        alternatives={alternatives}
        labels={[
          ...trip.stages.slice(0, -1).map((stage, index) => ({
            coord: stage.end.coord,
            text: stage.end.name,
            kind:
              !overview && index === selected
                ? ("selected" as const)
                : ("stop" as const),
          })),
          ...[first?.start, last?.end].flatMap((place) =>
            place
              ? [{ coord: place.coord, text: place.name, kind: "end" as const }]
              : [],
          ),
        ]}
        onPick={(place) => onPickAlternative?.(place)}
      />
      {trip.stages.slice(0, -1).map((stage, index) => (
        <Marker
          key={stage.id}
          longitude={stage.end.coord[0]}
          latitude={stage.end.coord[1]}
          anchor="left"
          // Center the circle on the stop. It is larger when selected.
          offset={[!overview && index === selected ? -20 : -16, 0]}
          style={{ zIndex: !overview && index === selected ? 4 : 3 }}
        >
          <StopMarker
            day={index + 1}
            name={stage.end.name}
            selected={!overview && index === selected}
            aria-label={t("map.selectStage", {
              day: index + 1,
              place: stage.end.name,
            })}
            onClick={() => onSelect(index)}
          />
        </Marker>
      ))}
      <ClusteredMarkers
        kind="hotels"
        items={hotels}
        // Selected and saved hotels always show on their own.
        pinned={(hotel) =>
          hotel.osmId === selectedHotelId ||
          trip.savedHotels.some((h) => h.osmId === hotel.osmId)
        }
        render={(hotel) => (
          <Marker
            key={hotel.osmId}
            longitude={hotel.coord[0]}
            latitude={hotel.coord[1]}
            style={{
              zIndex:
                activeHotel === hotel.osmId
                  ? 5
                  : hotel.osmId === selectedHotelId
                    ? 3
                    : 1,
            }}
          >
            <HotelMarker
              name={hotel.name}
              kind={hotel.kind}
              stars={hotel.stars}
              detour={hotel.detourKm * 1000}
              website={
                hotel.osmId === activeHotel && activeSite?.ok === false
                  ? undefined
                  : hotel.website
              }
              booking={hotelBookingUrl(trip, selected, hotel)}
              {...(hotel.osmId === activeHotel &&
                activeSite?.image && { image: activeSite.image })}
              selected={hotel.osmId === selectedHotelId}
              saved={trip.savedHotels.some((h) => h.osmId === hotel.osmId)}
              {...(onToggleSaveHotel && {
                onToggleSave: () => onToggleSaveHotel(hotel.osmId),
              })}
              onClick={() => onSelectHotel?.(hotel.osmId)}
              onActiveChange={(active) =>
                setActiveHotel((id) =>
                  active ? hotel.osmId : id === hotel.osmId ? undefined : id,
                )
              }
            />
          </Marker>
        )}
      />
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
            style={{ zIndex: 6 }}
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

const noStations: MapStation[] = [];

/**
 * Places close together on screen as one marker with their count, below
 * CLUSTER_ZOOM. A click zooms in to them. Pinned places never join one.
 */
function ClusteredMarkers<T extends { coord: LonLat }>({
  kind,
  items,
  pinned = () => false,
  render,
}: {
  kind: "hotels" | "stations";
  items: T[];
  pinned?: (item: T) => boolean;
  /** The marker of one place, with its key. */
  render: (item: T) => ReactNode;
}) {
  const { current: map } = useMap();
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 0);
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    update();
    map.on("zoomend", update);
    return () => void map.off("zoomend", update);
  }, [map]);

  if (!map || zoom >= CLUSTER_ZOOM) return items.map(render);
  const clusters = clusterPoints(
    items.filter((item) => !pinned(item)),
    (coord) => map.project(coord),
    CLUSTER_RADIUS,
  );
  return [
    ...items.filter(pinned).map(render),
    ...clusters.map(({ coord, items: members }) =>
      members.length === 1 && members[0] ? (
        render(members[0])
      ) : (
        <Marker
          key={`${kind}-${coord.join()}`}
          longitude={coord[0]}
          latitude={coord[1]}
          // A cluster often sits on the town of a stop. Below the point and
          // above the stop, it stays readable without hiding the day.
          anchor="top"
          offset={[0, 12]}
          style={{ zIndex: 5 }}
        >
          <ClusterMarker
            kind={kind}
            count={members.length}
            onClick={() =>
              map.fitBounds(boundsOf(members.map((m) => m.coord)), {
                padding: 80,
                maxZoom: CLUSTER_ZOOM,
              })
            }
          />
        </Marker>
      ),
    ),
  ];
}

/** A label on the map that options must not cover. */
type MapLabel = {
  coord: LonLat;
  text: string;
  kind: "selected" | "stop" | "end";
};

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * Rough label boxes in screen pixels, from the marker size and the text
 * length. Good enough to tell when labels run into each other.
 */
const boxOf = {
  selected: (x: number, y: number, chars: number): Box => ({
    left: x - 20,
    right: x + 26 + chars * 9,
    top: y - 20,
    bottom: y + 20,
  }),
  stop: (x: number, y: number, chars: number): Box => ({
    left: x - 16,
    right: x + 22 + chars * 7.5,
    top: y - 16,
    bottom: y + 16,
  }),
  end: (x: number, y: number, chars: number): Box => ({
    left: x - 12,
    right: x + 18 + chars * 7.5,
    top: y - 12,
    bottom: y + 12,
  }),
  option: (x: number, y: number, chars: number, beds: boolean): Box => ({
    left: x - 8,
    right: x + 14 + chars * 6.5 + (beds ? 28 : 0),
    top: y - 10,
    bottom: y + 10,
  }),
};

function overlaps(a: Box, b: Box) {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

/**
 * Other towns for the selected stop. An option whose label would cover a
 * stop, an end or an earlier option shows only its circle until hovered.
 */
function AlternativeMarkers({
  alternatives,
  labels,
  onPick,
}: {
  alternatives: MapAlternative[];
  labels: MapLabel[];
  onPick: (place: Place) => void;
}) {
  const { current: ref } = useMap();
  // Bumped on every zoom, so the boxes are measured again.
  const [zoomed, setZoomed] = useState(0);
  useEffect(() => {
    const map = ref?.getMap();
    if (!map) return;
    const update = () => setZoomed((n) => n + 1);
    map.on("zoomend", update);
    return () => void map.off("zoomend", update);
  }, [ref]);

  const crowded = useMemo(() => {
    const out = new Set<string>();
    if (!ref) return out;
    const taken = labels.map(({ coord, text, kind }) => {
      const { x, y } = ref.project(coord);
      return boxOf[kind](x, y, text.length);
    });
    for (const { place, label, beds } of alternatives) {
      const { x, y } = ref.project(place.coord);
      const box = boxOf.option(x, y, label.length, beds !== undefined);
      if (taken.some((t) => overlaps(t, box))) {
        out.add(place.name);
        // Its circle still takes room.
        taken.push(boxOf.option(x, y, 0, false));
      } else {
        taken.push(box);
      }
    }
    return out;
    // zoomed only triggers a new measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, zoomed, labels, alternatives]);

  return alternatives.map(({ place, label, beds }) => (
    <Marker
      key={place.name}
      longitude={place.coord[0]}
      latitude={place.coord[1]}
      anchor="left"
      offset={[-8, 0]}
      style={{ zIndex: 2 }}
    >
      <AlternativeMarker
        label={label}
        beds={beds}
        compact={crowded.has(place.name)}
        aria-label={label}
        onClick={() => onPick(place)}
      />
    </Marker>
  ));
}
