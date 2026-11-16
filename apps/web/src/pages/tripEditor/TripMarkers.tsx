import type { LonLat, Place, Trip } from "@wayline/domain";
import {
  AlternativeMarker,
  ClusterMarker,
  cn,
  EndpointMarker,
  HotelMarker,
  StationMarker,
  StopMarker,
  type StopTone,
  TownMarker,
} from "@wayline/ui";
import { type ReactNode, useEffect, useState } from "react";
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
import type { MapAlternative, TownLayer } from "./TripMap";

/** Stations show from this zoom on, so the whole trip stays calm. */
const STATION_ZOOM = 10;
/** Below this zoom, hotels and stations close together show as one. */
const CLUSTER_ZOOM = 13;
/** Screen distance in pixels within which stations join a cluster. */
const STATION_RADIUS = 36;
/** All hotels are near one stop, so below CLUSTER_ZOOM they show as one count. */
const HOTEL_RADIUS = Infinity;

/** Width of a town's hotel badge: padding, border, icon and digits. */
const townBadgePx = (hotels: number) => 30 + String(hotels).length * 7;

/** Label priority: lower wins when labels run into each other. */
const PRIORITY = {
  selected: 0,
  stop: 1,
  station: 2,
  choice: 3,
  hotel: 4,
  town: 5,
};

export type TripMarkersProps = {
  trip: Trip;
  selected: number;
  overview: boolean;
  onSelect: (index: number) => void;
  alternatives: MapAlternative[];
  onPickAlternative?: (id: string) => void;
  onHoverAlternative?: (id: string | undefined) => void;
  /** Id of the choice being previewed. */
  previewStop?: string;
  towns?: TownLayer;
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
  onHoverAlternative,
  previewStop,
  towns,
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
  // Stop i ends day i. The selected day starts at the stop before it.
  const toneOf = (index: number): StopTone =>
    overview
      ? "default"
      : index === selected
        ? "end"
        : index === selected - 1
          ? "start"
          : "muted";
  const endTones: StopTone[] = [toneOf(-1), toneOf(trip.stages.length - 1)];
  const radius = { end: 20, start: 16, default: 16, muted: 12 };
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
      const r = radius[toneOf(index)];
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
    for (const { id, place, label, beds, color } of alternatives) {
      const r = color ? 14 : 8;
      add(
        `choice-${id}`,
        PRIORITY.choice,
        place.coord,
        // The bed count adds about four characters.
        (x, y) =>
          labelBox(x, y, r, label.length + (beds === undefined ? 0 : 4), 6.5),
        (x, y) => labelBox(x, y, r),
      );
    }
    for (const { id, place, hotels: count } of towns?.towns ?? []) {
      // Towns give way to everything else and may hide.
      const half = townBadgePx(count) / 2;
      add(
        `town-${id}`,
        PRIORITY.town,
        place.coord,
        (x, y) => labelBox(x, y, half, place.name.length, 6.5),
        (x, y) => centerBox(x, y, half * 2, 24),
        false,
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

  // A tap on the empty map ends a town preview. Phones have no pointer to
  // leave the town with.
  const previewedTown = towns?.previewed;
  const onHoverTown = towns?.onHover;
  useEffect(() => {
    if (!map || !previewedTown || !onHoverTown) return;
    const end = (e: { originalEvent: Event }) => {
      if (e.originalEvent.target === map.getCanvas()) onHoverTown(undefined);
    };
    map.on("click", end);
    return () => {
      map.off("click", end);
    };
  }, [map, previewedTown, onHoverTown]);
  // The preview label opens away from the near edge of the map.
  const opensLeft = (coord: LonLat) =>
    !!map && map.project(coord).x > map.getContainer().clientWidth / 2;

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
            tone={endTones[index] ?? "default"}
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
      {towns?.towns.map(({ id, place, hotels: count, label }) => {
        const previewed = id === towns.previewed;
        const cut = previewed ? undefined : crowded.get(`town-${id}`);
        if (cut === "none") return null;
        const hover = (e: { pointerType: string }) =>
          e.pointerType === "mouse" && towns.onHover(id);
        const leave = (e: { pointerType: string }) =>
          e.pointerType === "mouse" && towns.onHover(undefined);
        return (
          <Marker
            key={`town-${id}`}
            longitude={place.coord[0]}
            latitude={place.coord[1]}
            anchor="left"
            offset={[-townBadgePx(count) / 2, 0]}
            style={{ zIndex: previewed ? 7 : 1 }}
          >
            <div className="relative">
              <TownMarker
                name={place.name}
                hotels={count}
                selected={previewed}
                compact={cut === "core"}
                aria-label={label}
                onClick={() => towns.onPick(id)}
                onPointerEnter={hover}
                onPointerLeave={leave}
                // Only keyboard focus previews. A tap previews on its own.
                onFocus={(e) =>
                  e.currentTarget.matches(":focus-visible") && towns.onHover(id)
                }
                onBlur={() => towns.onHover(undefined)}
              />
              {previewed && towns.preview && (
                <div
                  className={cn(
                    "absolute top-full left-0 mt-2 flex w-max",
                    opensLeft(place.coord) && "-translate-x-full",
                  )}
                  // Opening left, it ends at the badge, not at the name.
                  style={
                    opensLeft(place.coord)
                      ? { left: townBadgePx(count) }
                      : undefined
                  }
                >
                  {towns.preview}
                </div>
              )}
            </div>
          </Marker>
        );
      })}
      {alternatives.map(({ id, place, label, beds, color }) => (
        <Marker
          key={id}
          longitude={place.coord[0]}
          latitude={place.coord[1]}
          anchor="left"
          // Center the circle on the town: 28 px, 32 px while previewed.
          offset={[color ? (id === previewStop ? -16 : -14) : -8, 0]}
          style={{ zIndex: id === previewStop ? 5 : 2 }}
        >
          <AlternativeMarker
            label={label}
            beds={beds}
            {...(color && { color, day: selected + 1 })}
            selected={id === previewStop}
            compact={crowded.has(`choice-${id}`)}
            aria-label={label}
            onClick={() => onPickAlternative?.(id)}
            onMouseEnter={() => onHoverAlternative?.(id)}
            onMouseLeave={() => onHoverAlternative?.(undefined)}
            onFocus={() => onHoverAlternative?.(id)}
            onBlur={() => onHoverAlternative?.(undefined)}
          />
        </Marker>
      ))}
      {stops.map((stage, index) => (
        <Marker
          key={stage.id}
          longitude={stage.end.coord[0]}
          latitude={stage.end.coord[1]}
          anchor="left"
          // Center the circle on the stop. Its size depends on the tone.
          offset={[-radius[toneOf(index)], 0]}
          style={{ zIndex: toneOf(index) === "muted" ? 2 : 4 }}
        >
          <StopMarker
            day={index + 1}
            {...(!crowded.has(`stop-${index}`) && { name: stage.end.name })}
            tone={toneOf(index)}
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
