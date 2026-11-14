import { useQuery } from "@tanstack/react-query";
import {
  type Area,
  type BBox,
  distanceKm,
  type LonLat,
  type Place,
} from "@wayline/domain";
import {
  EndpointMarker,
  MapColorSwitch,
  MapHint,
  RainLegend,
} from "@wayline/ui";
import { MousePointerClick } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
} from "react-map-gl/maplibre";
import { AppMap, type MapPadding } from "../../components/map/AppMap";
import { useIsPhone } from "../../components/useIsPhone";
import { useServices } from "../../data/ServicesProvider";
import { AREA_LAYER, type AreaColor, AreaLayer } from "./AreaLayer";
import type { AreaReach } from "./areas";
import { REACH_LAYER, ReachLayer, type ReachStation } from "./ReachLayer";
import { RouteShelfLayer } from "./RouteShelfLayer";
import { partLine, type ShelfRoute } from "./routeShelf";

const compactPadding: MapPadding = { top: 24, right: 80, bottom: 24, left: 32 };

/** A click means a place whose label is about this close, in pixels. */
const PICK_PX = 30;

/** Over a station: the click picks it, not the nearest place. */
const STATION_CURSOR = "pointer";

function bboxCorners([w, s, e, n]: BBox): LonLat[] {
  return [
    [w, s],
    [e, n],
  ];
}

/** Corners of the area with route data. */
function useDataRegion() {
  const { network } = useServices();
  return useQuery({
    queryKey: ["newTrip", "dataRegion"],
    staleTime: Infinity,
    queryFn: async (): Promise<LonLat[]> =>
      bboxCorners((await network.manifest()).region.bbox),
  });
}

export function NewTripMap({
  start,
  end,
  next,
  onPick,
  reach,
  shelf,
  areas,
}: {
  start: Place | null;
  end: Place | null;
  /** What the next click on the map sets. */
  next?: "start" | "end";
  /** A click on the map, with how far PICK_PX reaches there. */
  onPick?: (at: LonLat, nearKm: number) => Place | undefined;
  /** A signed route from the route shelf, with its stretch when selected. */
  shelf?: { route: ShelfRoute; selected: boolean; wet?: boolean };
  /** Stations by train time. A click on one picks it. */
  reach?: {
    stations: ReachStation[];
    attribution: string;
    /** Fit the stations in reach again when this changes. */
    fitKey: string;
    onPick: (station: Place) => void;
  };
  /** Areas by train time or weather. A click on one picks it. */
  areas?: {
    areas: AreaReach[];
    attribution: string;
    color: AreaColor;
    /** Shows the switch between train time and weather. */
    onColor?: (color: AreaColor) => void;
    /** The map zooms to it. */
    picked?: Area;
    /** Highlighted, e.g. from the list. */
    hovered?: string;
    onPick: (id: string) => void;
  };
}) {
  const { t } = useTranslation("newTrip");
  const region = useDataRegion();
  const isPhone = useIsPhone();
  const mapRef = useRef<MapRef>(null);
  const places = [start, end].filter((p): p is Place => p !== null);
  const selectedRoute = shelf?.selected ? shelf.route : undefined;
  const stretchFit = useMemo(() => {
    const s = selectedRoute?.stretch;
    const part = s && selectedRoute.parts[s.part];
    return part && partLine(part, s.from.km, s.to.km);
  }, [selectedRoute]);

  // A start picked on the map stays where the user looked, so they can pick
  // the end next to it. Everything else moves the map to the places.
  const [picked, setPicked] = useState<string>();
  const [hovered, setHovered] = useState<number>();
  const [hoveredArea, setHoveredArea] = useState<string>();
  const key = places.map((p) => p.coord.join()).join(" ");
  const fromMap = places.length === 1 && key === picked;
  const pickedArea = areas?.picked;

  const reachStation = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const i: unknown = feature?.properties?.i;
    return feature?.layer.id === REACH_LAYER && typeof i === "number"
      ? reach?.stations[i]
      : undefined;
  };
  const areaId = (event: MapLayerMouseEvent) => {
    const feature = event.features?.find((f) => f.layer.id === AREA_LAYER);
    const id: unknown = feature?.properties?.id;
    return typeof id === "string" ? id : undefined;
  };

  const picking = onPick && {
    cursor: "crosshair",
    onClick: (event: MapLayerMouseEvent) => {
      const station = reachStation(event);
      if (station) return reach?.onPick(station.place);
      // A click on another area opens it. In the picked one it picks a place.
      const area = areaId(event);
      if (areas && (!pickedArea || (area && area !== pickedArea.id))) {
        if (area) areas.onPick(area);
        return;
      }
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
  // With areas: all of Germany, or the picked area.
  const regionFit = pickedArea
    ? bboxCorners(pickedArea.bbox)
    : !areas && inReach?.length
      ? inReach
      : (region.data ?? []);
  const regionKey = areas ? `area:${pickedArea?.id ?? ""}` : reach?.fitKey;
  const overArea = hoveredArea !== undefined && hoveredArea !== pickedArea?.id;

  const onColor = !pickedArea && areas?.onColor;
  const colorSwitch = onColor && (
    <MapColorSwitch
      aria-label={t("map.colorBy")}
      options={[
        { value: "reach", label: t("map.byReach") },
        { value: "weather", label: t("map.byWeather") },
      ]}
      value={areas.color}
      onValueChange={(v) => onColor(v as AreaColor)}
      {...(areas.color === "weather" && {
        legend: (
          <RainLegend
            labels={{
              dry: t("rain.dry"),
              showers: t("rain.showers"),
              wet: t("rain.wet"),
            }}
            over={t("map.overMax")}
          />
        ),
      })}
    />
  );

  // Wait for the region, so the map opens on it instead of moving there.
  if (region.isPending) return null;
  return (
    <AppMap
      label={t("map.label")}
      fit={
        stretchFit ?? (places.length ? places.map((p) => p.coord) : regionFit)
      }
      fitKey={fromMap ? "" : key || regionKey}
      mapRef={mapRef}
      network={areas && !pickedArea ? "off" : "full"}
      hiddenLabels={places.map((p) => p.name)}
      {...(isPhone && { padding: compactPadding, controls: false })}
      {...picking}
      {...((reach || areas) && {
        interactiveLayerIds: [
          ...(reach ? [REACH_LAYER] : []),
          ...(areas ? [AREA_LAYER] : []),
        ],
        ...((hovered !== undefined || overArea) && { cursor: STATION_CURSOR }),
        onMouseMove: (event: MapLayerMouseEvent) => {
          const i: unknown =
            reachStation(event) && event.features?.[0]?.properties?.i;
          setHovered(typeof i === "number" ? i : undefined);
          setHoveredArea(areaId(event));
        },
        onMouseLeave: () => {
          setHovered(undefined);
          setHoveredArea(undefined);
        },
      })}
      {...(colorSwitch && {
        overlay: (
          // Under the hint, clear of the attribution.
          <div className="absolute top-14 left-3 z-panel">{colorSwitch}</div>
        ),
      })}
      hint={
        onPick &&
        next && (
          <MapHint icon={<MousePointerClick aria-hidden />}>
            {t(
              areas && !pickedArea
                ? "map.pickArea"
                : next === "start"
                  ? "map.pickStart"
                  : "map.pickEnd",
            )}
          </MapHint>
        )
      }
    >
      {areas && (
        <AreaLayer
          areas={areas.areas}
          attribution={areas.attribution}
          color={areas.onColor ? areas.color : "reach"}
          {...(pickedArea && { picked: pickedArea.id })}
          {...((areas.hovered ?? hoveredArea) && {
            hovered: areas.hovered ?? hoveredArea,
          })}
        />
      )}
      {shelf && (
        <RouteShelfLayer
          route={shelf.route}
          selected={shelf.selected}
          wet={shelf.wet}
        />
      )}
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
