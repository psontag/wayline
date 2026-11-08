import { useQuery } from "@tanstack/react-query";
import { distanceKm, type LonLat, type Place } from "@wayline/domain";
import { EndpointMarker, MapHint } from "@wayline/ui";
import { MousePointerClick } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
} from "react-map-gl/maplibre";
import { AppMap, type MapPadding } from "../../components/map/AppMap";
import { useIsPhone } from "../../components/useIsPhone";
import { useServices } from "../../data/ServicesProvider";
import { REACH_LAYER, ReachLayer, type ReachStation } from "./ReachLayer";

const compactPadding: MapPadding = { top: 24, right: 80, bottom: 24, left: 32 };

/** A click means a place whose label is about this close, in pixels. */
const PICK_PX = 30;

/** Over a station: the click picks it, not the nearest place. */
const STATION_CURSOR = "pointer";

/** Corners of the area with route data. */
function useDataRegion() {
  const { network } = useServices();
  return useQuery({
    queryKey: ["newTrip", "dataRegion"],
    staleTime: Infinity,
    queryFn: async (): Promise<LonLat[]> => {
      const [w, s, e, n] = (await network.manifest()).region.bbox;
      return [
        [w, s],
        [e, n],
      ];
    },
  });
}

export function NewTripMap({
  start,
  end,
  next,
  onPick,
  reach,
}: {
  start: Place | null;
  end: Place | null;
  /** What the next click on the map sets. */
  next?: "start" | "end";
  /** A click on the map, with how far PICK_PX reaches there. */
  onPick?: (at: LonLat, nearKm: number) => Place | undefined;
  /** Stations by train time. A click on one picks it. */
  reach?: {
    stations: ReachStation[];
    attribution: string;
    /** Fit the stations in reach again when this changes. */
    fitKey: string;
    onPick: (station: Place) => void;
  };
}) {
  const { t } = useTranslation("newTrip");
  const region = useDataRegion();
  const isPhone = useIsPhone();
  const mapRef = useRef<MapRef>(null);
  const places = [start, end].filter((p): p is Place => p !== null);

  // A start picked on the map stays where the user looked, so they can pick
  // the end next to it. Everything else moves the map to the places.
  const [picked, setPicked] = useState<string>();
  const [hovered, setHovered] = useState<number>();
  const key = places.map((p) => p.coord.join()).join(" ");
  const fromMap = places.length === 1 && key === picked;

  const reachStation = (event: MapLayerMouseEvent) => {
    const i: unknown = event.features?.[0]?.properties?.i;
    return typeof i === "number" ? reach?.stations[i] : undefined;
  };

  const picking = onPick && {
    cursor: "crosshair",
    onClick: (event: MapLayerMouseEvent) => {
      const station = reachStation(event);
      if (station) return reach?.onPick(station.place);
      const { x, y } = event.point;
      const near = event.target.unproject([x + PICK_PX, y]);
      const at: LonLat = [event.lngLat.lng, event.lngLat.lat];
      const place = onPick(at, distanceKm(at, [near.lng, near.lat]));
      if (place && !start) setPicked(place.coord.join());
    },
  };

  const inReach = reach?.stations
    .filter((s) => !s.over)
    .map((s) => s.place.coord);
  const regionFit = inReach?.length ? inReach : (region.data ?? []);

  // Wait for the region, so the map opens on it instead of moving there.
  if (region.isPending) return null;
  return (
    <AppMap
      label={t("map.label")}
      fit={places.length ? places.map((p) => p.coord) : regionFit}
      fitKey={fromMap ? "" : key || reach?.fitKey}
      mapRef={mapRef}
      network="full"
      hiddenLabels={places.map((p) => p.name)}
      {...(isPhone && { padding: compactPadding, controls: false })}
      {...picking}
      {...(reach && {
        interactiveLayerIds: [REACH_LAYER],
        ...(hovered !== undefined && { cursor: STATION_CURSOR }),
        onMouseMove: (event: MapLayerMouseEvent) => {
          const i: unknown = event.features?.[0]?.properties?.i;
          setHovered(typeof i === "number" ? i : undefined);
        },
        onMouseLeave: () => setHovered(undefined),
      })}
      hint={
        onPick &&
        next && (
          <MapHint icon={<MousePointerClick aria-hidden />}>
            {t(next === "start" ? "map.pickStart" : "map.pickEnd")}
          </MapHint>
        )
      }
    >
      {reach && (
        <ReachLayer
          stations={reach.stations}
          attribution={reach.attribution}
          hovered={hovered}
        />
      )}
      {places.map((place) => (
        <Marker
          key={place.name + place.coord.join()}
          longitude={place.coord[0]}
          latitude={place.coord[1]}
          anchor="left"
          offset={[-12, 0]}
        >
          <EndpointMarker
            name={place.name}
            station={place.kind === "station"}
          />
        </Marker>
      ))}
    </AppMap>
  );
}
