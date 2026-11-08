import type { LonLat, Place, Trip } from "@wayline/domain";
import {
  AlternativeMarker,
  ClusterMarker,
  EndpointMarker,
  HotelMarker,
  StationMarker,
  StopMarker,
} from "@wayline/ui";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { type MapRef, Marker, useMap } from "react-map-gl/maplibre";
import { boundsOf } from "../../components/map/AppMap";
import { type Cluster, clusterPoints } from "../../components/map/cluster";
import {
  type Box,
  centerBox,
  type Cut,
  labelBox,
  type MapLabel,
  placeLabels,
  useZoom,
} from "../../components/map/labels";
import { useSiteInfo } from "../../data/queries";
import { hotelBookingUrl } from "./BookingLink";
import type { MapHotel } from "./mapTypes";
import type { MapStation } from "./stations";
import type { MapAlternative } from "./TripMap";

/** Stations show from this zoom on, so the whole trip stays calm. */
const STATION_ZOOM = 10;
/** Below this zoom, hotels and stations close together show as one. */
const CLUSTER_ZOOM = 13;
/** Screen distance in pixels within which stations join a cluster. */
const STATION_RADIUS = 36;
/** All hotels are near one stop, so below CLUSTER_ZOOM they show as one count. */
const HOTEL_RADIUS = Infinity;

/** Label priority: lower wins when labels run into each other. */
const PRIORITY = {
  selected: 0,
  stop: 1,
  station: 2,
  choice: 3,
  hotel: 4,
};

export type TripMarkersProps = {
  trip: Trip;
  selected: number;
  overview: boolean;
  onSelect: (index: number) => void;
  alternatives: MapAlternative[];
  onPickAlternative?: (place: Place) => void;
  stations: MapStation[];
  hotels: MapHotel[];
  selectedHotelId?: string;
  onSelectHotel?: (osmId: string) => void;
  onToggleSaveHotel?: (osmId: string) => void;
};

/**
 * Ends, stops, stations, stop choices and hotels. When their labels run into
 * each other, the lower priority one shows only its icon or hides.
 */
export function TripMarkers({
  trip,
  selected,
  overview,
  onSelect,
  alternatives,
  onPickAlternative,
  stations,
  hotels,
  selectedHotelId,
  onSelectHotel,
  onToggleSaveHotel,
}: TripMarkersProps) {
  const { t } = useTranslation("tripEditor");
  const { current: map } = useMap();
  const zoom = useZoom(map);
  const [activeHotel, setActiveHotel] = useState<string>();
  const activeSite = useSiteInfo(
    hotels.find((h) => h.osmId === activeHotel)?.website,
  );

  const first = trip.stages[0];
  const last = trip.stages.at(-1);
  const ends = [first?.start, last?.end].filter((p): p is Place => !!p);
  const stops = trip.stages.slice(0, -1);
  const isSelected = (index: number) => !overview && index === selected;
  const saved = (osmId: string) =>
    trip.savedHotels.some((h) => h.osmId === osmId);
  // Selected and saved hotels always show on their own.
  const pinned = (hotel: MapHotel) =>
    hotel.osmId === selectedHotelId || saved(hotel.osmId);

  // Cheap enough to measure on every render; zoom triggers a new one.
  const stationGroups = groups(
    "station",
    map,
    zoom,
    zoom >= STATION_ZOOM ? stations : [],
    STATION_RADIUS,
  );
  const hotelGroups = groups("hotel", map, zoom, hotels, HOTEL_RADIUS, pinned);

  // Stops, ends and stop choices always show their marker and lose only
  // their name. Stations hide. Hotels shrink to a dot, then hide.
  const crowded = (() => {
    if (!map) return new Map<string, Cut>();
    const at = (coord: LonLat) => map.project(coord);
    const labels: MapLabel[] = [];
    const add = (
      id: string,
      priority: number,
      coord: LonLat,
      box: (x: number, y: number) => Box,
      core?: (x: number, y: number) => Box,
      fixed = !!core,
    ) => {
      const { x, y } = at(coord);
      labels.push({
        id,
        priority,
        box: box(x, y),
        ...(core && { core: core(x, y) }),
        fixed,
      });
    };
    stops.forEach((stage, index) => {
      // The selected stop is larger, with a larger name.
      const r = isSelected(index) ? 20 : 16;
      const charPx = isSelected(index) ? 9 : 7.5;
      add(
        `stop-${index}`,
        isSelected(index) ? PRIORITY.selected : PRIORITY.stop,
        stage.end.coord,
        (x, y) => labelBox(x, y, r, stage.end.name.length, charPx),
        (x, y) => labelBox(x, y, r),
      );
    });
    ends.forEach((place, index) =>
      add(
        `end-${index}`,
        PRIORITY.stop,
        place.coord,
        (x, y) => labelBox(x, y, 12, place.name.length),
        (x, y) => labelBox(x, y, 12),
      ),
    );
    for (const group of stationGroups) {
      add(
        group.id,
        PRIORITY.station,
        group.coord,
        group.items.length === 1
          ? (x, y) => centerBox(x, y, 16)
          : (x, y) => clusterBox(x, y),
      );
    }
    for (const { place, label, beds } of alternatives) {
      add(
        `choice-${place.name}`,
        PRIORITY.choice,
        place.coord,
        // The bed count adds about four characters.
        (x, y) =>
          labelBox(x, y, 8, label.length + (beds === undefined ? 0 : 4), 6.5),
        (x, y) => labelBox(x, y, 8),
      );
    }
    for (const group of hotelGroups) {
      const [hotel] = group.items;
      // Selected and saved hotels always show in full, often under the stop.
      if (group.items.length > 1 || !hotel || pinned(hotel)) continue;
      add(
        group.id,
        PRIORITY.hotel,
        group.coord,
        (x, y) => centerBox(x, y, 44, 22),
        (x, y) => centerBox(x, y, 20),
        false,
      );
    }
    return placeLabels(labels);
  })();

  const zoomTo = (coords: LonLat[]) =>
    map?.fitBounds(boundsOf(coords), { padding: 80, maxZoom: CLUSTER_ZOOM });

  return (
    <>
      {ends.map((place, index) => (
        <Marker
          key={`end-${index}`}
          longitude={place.coord[0]}
          latitude={place.coord[1]}
          anchor="left"
          offset={[-12, 0]}
        >
          <EndpointMarker
            {...(!crowded.has(`end-${index}`) && { name: place.name })}
            station={place.kind === "station"}
          />
        </Marker>
      ))}
      {stationGroups.map((group) => {
        const { id } = group;
        if (crowded.has(id)) return null;
        const [station] = group.items;
        return group.items.length === 1 && station ? (
          <Marker
            key={id}
            longitude={station.coord[0]}
            latitude={station.coord[1]}
            style={{ zIndex: 1 }}
          >
            <StationMarker name={station.name} href={station.href} />
          </Marker>
        ) : (
          <ClusterAt key={id} coord={group.coord}>
            <ClusterMarker
              kind="stations"
              count={group.items.length}
              onClick={() => zoomTo(group.items.map((s) => s.coord))}
            />
          </ClusterAt>
        );
      })}
      {alternatives.map(({ place, label, beds }) => (
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
            compact={crowded.has(`choice-${place.name}`)}
            aria-label={label}
            onClick={() => onPickAlternative?.(place)}
          />
        </Marker>
      ))}
      {stops.map((stage, index) => (
        <Marker
          key={stage.id}
          longitude={stage.end.coord[0]}
          latitude={stage.end.coord[1]}
          anchor="left"
          // Center the circle on the stop. It is larger when selected.
          offset={[isSelected(index) ? -20 : -16, 0]}
          style={{ zIndex: isSelected(index) ? 4 : 3 }}
        >
          <StopMarker
            day={index + 1}
            {...(!crowded.has(`stop-${index}`) && { name: stage.end.name })}
            selected={isSelected(index)}
            aria-label={t("map.selectStage", {
              day: index + 1,
              place: stage.end.name,
            })}
            onClick={() => onSelect(index)}
          />
        </Marker>
      ))}
      {hotelGroups.map((group) => {
        const { id } = group;
        const [hotel] = group.items;
        if (group.items.length > 1 || !hotel) {
          return (
            <ClusterAt key={id} coord={group.coord}>
              <ClusterMarker
                kind="hotels"
                count={group.items.length}
                onClick={() => zoomTo(group.items.map((h) => h.coord))}
              />
            </ClusterAt>
          );
        }
        if (crowded.get(id) === "none") return null;
        return (
          <Marker
            key={id}
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
              compact={crowded.has(id)}
              selected={hotel.osmId === selectedHotelId}
              saved={saved(hotel.osmId)}
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
        );
      })}
    </>
  );
}

/**
 * Places close together on screen as one group, below CLUSTER_ZOOM. Pinned
 * places never join one. A group of one is a single place.
 */
function groups<T extends { coord: LonLat }>(
  kind: string,
  map: MapRef | undefined,
  zoom: number,
  items: T[],
  radius: number,
  pinned: (item: T) => boolean = () => false,
): (Cluster<T> & { id: string })[] {
  const single = (item: T) => ({ coord: item.coord, items: [item] });
  const all: Cluster<T>[] =
    !map || zoom >= CLUSTER_ZOOM
      ? items.map(single)
      : [
          ...items.filter(pinned).map(single),
          ...clusterPoints(
            items.filter((item) => !pinned(item)),
            (coord) => map.project(coord),
            radius,
          ),
        ];
  return all.map((group) => ({
    ...group,
    id: `${kind}-${group.items.length}-${group.coord.join()}`,
  }));
}

/** Box of a cluster marker, drawn below its point. */
function clusterBox(x: number, y: number): Box {
  return { left: x - 20, right: x + 20, top: y + 12, bottom: y + 32 };
}

/**
 * A cluster often sits on the town of a stop. Below the point and above the
 * stop, it stays readable without hiding the day.
 */
function ClusterAt({
  coord,
  children,
}: {
  coord: LonLat;
  children: ReactNode;
}) {
  return (
    <Marker
      longitude={coord[0]}
      latitude={coord[1]}
      anchor="top"
      offset={[0, 12]}
      style={{ zIndex: 5 }}
    >
      {children}
    </Marker>
  );
}
