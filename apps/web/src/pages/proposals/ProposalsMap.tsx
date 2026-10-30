import {
  decodeLine,
  type LonLat,
  type Place,
  type Proposal,
} from "@wayline/domain";
import {
  EndpointMarker,
  IconButton,
  MapControlGroup,
  MapLegend,
  RouteLabel,
  StopMarker,
  useTheme,
  useThemeTokens,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Minus, Plus } from "lucide-react";
import {
  type DataDrivenPropertyValueSpecification,
  type FilterSpecification,
  type LngLatBoundsLike,
  setWorkerUrl,
} from "maplibre-gl";
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
import { HillshadeLayer } from "../../components/HillshadeLayer";
import { NetworkLayer } from "../../components/NetworkLayer";
import { useHiddenPlaceLabels } from "../../components/placeLabels";
import { labelPoints, tripPoints } from "./proposalView";
import { flavourOf, routeColorKey, routeColorToken } from "./routeColor";

setWorkerUrl(workerUrl);

const mapStyles = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// Endpoint labels sit right of the point, so keep more room on that side.
const padding = { top: 56, right: 120, bottom: 40, left: 56 };
const lineLayout = { "line-cap": "round", "line-join": "round" } as const;

export type ProposalsMapProps = {
  proposals: Proposal[];
  /** Start and end of the request, shown before any proposal is there. */
  places: Place[];
  /** Proposal shown on top, e.g. the selected or hovered one. */
  highlighted?: string;
  /** Day of the highlighted proposal to show at full strength. */
  highlightedDay?: number;
  onSelect: (id: string) => void;
};

function bounds(coords: LonLat[]): LngLatBoundsLike | undefined {
  if (!coords.length) return undefined;
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  // Pad a single place, so the map does not zoom in all the way.
  const pad = w === e && s === n ? 0.3 : 0;
  return [w - pad, s - pad, e + pad, n + pad];
}

const regionBounds: LngLatBoundsLike = [10.45, 49.59, 12.26, 50.52];

/** All proposals on one map, each in its own color. */
export function ProposalsMap({
  proposals,
  places,
  highlighted,
  highlightedDay,
  onSelect,
}: ProposalsMapProps) {
  const { t } = useTranslation("proposals");
  const { resolvedTheme } = useTheme();
  const tokens = useThemeTokens();
  const mapRef = useRef<MapRef>(null);
  const [labelLayerId, setLabelLayerId] = useState<string>();
  const [cursor, setCursor] = useState<string>();

  const routes = useMemo(
    () => proposals.map((p) => tripPoints(p.trip)),
    [proposals],
  );
  const labels = useMemo(() => labelPoints(routes), [routes]);
  const colors = useMemo(
    () => proposals.map((p, i) => tokens[routeColorToken[routeColorKey(p, i)]]),
    [proposals, tokens],
  );

  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: proposals.map((p, i) => ({
        type: "Feature",
        properties: {
          id: p.id,
          highlighted: p.id === highlighted,
          color: colors[i] ?? tokens.routeBest,
        },
        geometry: {
          type: "LineString",
          coordinates: (routes[i] ?? []).map((point) => point.coord),
        },
      })),
    }),
    [proposals, routes, highlighted, colors, tokens.routeBest],
  );

  // The highlighted proposal day by day, so one day can stand out.
  const shownIndex = proposals.findIndex((p) => p.id === highlighted);
  const shown = proposals[shownIndex];
  const shownColor = colors[shownIndex] ?? tokens.routeBest;
  const days = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: (shown?.trip.stages ?? []).map((stage, i) => ({
        type: "Feature",
        properties: { day: i + 1 },
        geometry: {
          type: "LineString",
          coordinates: stage.legs.flatMap((leg) => decodeLine(leg.geometry)),
        },
      })),
    }),
    [shown],
  );

  const ends = useMemo(() => {
    const first = proposals[0]?.trip;
    if (!first) return places;
    const start = first.stages[0]?.start;
    const endNames = new Set<string>();
    const out: Place[] = start ? [start] : [];
    for (const p of proposals) {
      const end = p.trip.stages.at(-1)?.end;
      if (!end || end.name === start?.name || endNames.has(end.name)) continue;
      endNames.add(end.name);
      out.push(end);
    }
    return out;
  }, [proposals, places]);

  const stopCoords = useMemo(
    () => [
      ...places.map((p) => p.coord),
      ...proposals.flatMap((p) => p.trip.stages.map((s) => s.end.coord)),
    ],
    [proposals, places],
  );

  const hideLabels = useHiddenPlaceLabels(
    mapRef,
    ends.map((p) => p.name),
  );
  const onStyle = () => {
    const layers = mapRef.current?.getStyle()?.layers ?? [];
    setLabelLayerId(layers.find((layer) => layer.type === "symbol")?.id);
    hideLabels();
  };

  // Show everything whenever a proposal comes in.
  const view = bounds([
    ...routes.flat().map((p) => p.coord),
    ...ends.map((p) => p.coord),
  ]);
  const viewKey = JSON.stringify(view);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!view) return;
    mapRef.current?.fitBounds(view, {
      padding,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 600,
    });
    // viewKey stands for view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  const onClick = (event: MapLayerMouseEvent) => {
    const id = event.features?.[0]?.properties?.id;
    if (typeof id === "string") onSelect(id);
  };

  const notHighlighted: FilterSpecification = [
    "==",
    ["get", "highlighted"],
    false,
  ];
  const dayOpacity = (dimmed: number) =>
    highlightedDay === undefined
      ? 1
      : ([
          "case",
          ["==", ["get", "day"], highlightedDay],
          1,
          dimmed,
        ] satisfies DataDrivenPropertyValueSpecification<number>);

  return (
    <div className="absolute inset-0" role="region" aria-label={t("map.label")}>
      <MapGL
        ref={mapRef}
        initialViewState={{
          bounds: view ?? regionBounds,
          fitBoundsOptions: { padding },
        }}
        mapStyle={mapStyles[resolvedTheme]}
        style={{ position: "absolute", inset: "0" }}
        onLoad={onStyle}
        onStyleData={onStyle}
        interactiveLayerIds={["proposal-hit"]}
        onClick={onClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor(undefined)}
        cursor={cursor}
      >
        <HillshadeLayer beforeId={labelLayerId} />
        <Source id="proposals" type="geojson" data={data}>
          <Layer
            id="proposal-line"
            beforeId={labelLayerId}
            type="line"
            filter={notHighlighted}
            layout={lineLayout}
            paint={{
              "line-color": ["get", "color"],
              "line-width": 3,
              "line-opacity": 0.5,
            }}
          />
          <Layer
            id="proposal-hit"
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.route,
              "line-width": 18,
              "line-opacity": 0,
            }}
          />
        </Source>
        <Source id="days" type="geojson" data={days}>
          <Layer
            id="day-casing"
            beforeId={labelLayerId}
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": tokens.routeOutline,
              "line-width": 9,
              "line-opacity": dayOpacity(0.15),
            }}
          />
          <Layer
            id="day-line"
            beforeId={labelLayerId}
            type="line"
            layout={lineLayout}
            paint={{
              "line-color": shownColor,
              "line-width": 6,
              "line-opacity": dayOpacity(0.4),
            }}
          />
        </Source>
        <NetworkLayer around={stopCoords} beforeId="proposal-line" subtle />

        {ends.map((place) => (
          <Marker
            key={place.name}
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
        {shown?.trip.stages.slice(0, -1).map((stage, i) => (
          <Marker
            key={`${shown.id}-${stage.id}`}
            longitude={stage.end.coord[0]}
            latitude={stage.end.coord[1]}
            anchor="left"
            offset={[-14, 0]}
            style={{ zIndex: 1 }}
          >
            <StopMarker
              day={i + 1}
              name={stage.end.name}
              aria-label={t("map.stop", { day: i + 1, place: stage.end.name })}
              onClick={() => onSelect(shown.id)}
            />
          </Marker>
        ))}
        {proposals.map((p, i) => {
          const at = labels[i];
          if (!at) return null;
          const selected = p.id === highlighted;
          const flavour = flavourOf(p);
          return (
            <Marker
              key={p.id}
              longitude={at[0]}
              latitude={at[1]}
              style={{ zIndex: selected ? 2 : 1 }}
            >
              <RouteLabel
                label={flavour ? t(`flavour.${flavour}`) : String(i + 1)}
                color={routeColorKey(p, i)}
                selected={selected}
                aria-label={t("map.select", { number: i + 1 })}
                onClick={() => onSelect(p.id)}
              />
            </Marker>
          );
        })}
      </MapGL>
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
      <div className="absolute bottom-3 left-3 z-panel hidden sm:block">
        <MapLegend items={[{ label: t("map.network"), line: "network" }]} />
      </div>
    </div>
  );
}
