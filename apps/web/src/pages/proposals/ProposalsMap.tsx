import type { LonLat, Place, Proposal } from "@wayline/domain";
import {
  EndpointMarker,
  IconButton,
  MapControlGroup,
  ProposalMarker,
  useTheme,
  useThemeTokens,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Minus, Plus } from "lucide-react";
import {
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
import { useHiddenPlaceLabels } from "../../components/placeLabels";
import { labelPoints, tripPoints } from "./proposalView";

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

/** All proposals on one map. Unselected ones are dimmed. */
export function ProposalsMap({
  proposals,
  places,
  highlighted,
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

  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features: proposals.map((p, i) => ({
        type: "Feature",
        properties: { id: p.id, highlighted: p.id === highlighted },
        geometry: {
          type: "LineString",
          coordinates: (routes[i] ?? []).map((point) => point.coord),
        },
      })),
    }),
    [proposals, routes, highlighted],
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

  const isHighlighted: FilterSpecification = [
    "==",
    ["get", "highlighted"],
    true,
  ];
  const notHighlighted: FilterSpecification = [
    "==",
    ["get", "highlighted"],
    false,
  ];

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
        <Source id="proposals" type="geojson" data={data}>
          <Layer
            id="proposal-casing"
            beforeId={labelLayerId}
            type="line"
            filter={notHighlighted}
            layout={lineLayout}
            paint={{ "line-color": tokens.surface, "line-width": 8 }}
          />
          <Layer
            id="proposal-line"
            beforeId={labelLayerId}
            type="line"
            filter={notHighlighted}
            layout={lineLayout}
            paint={{ "line-color": tokens.routeDimmed, "line-width": 5 }}
          />
          <Layer
            id="selected-casing"
            beforeId={labelLayerId}
            type="line"
            filter={isHighlighted}
            layout={lineLayout}
            paint={{ "line-color": tokens.routeCasing, "line-width": 11 }}
          />
          <Layer
            id="selected-line"
            beforeId={labelLayerId}
            type="line"
            filter={isHighlighted}
            layout={lineLayout}
            paint={{ "line-color": tokens.routeSelected, "line-width": 7 }}
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
        {proposals.map((p, i) => {
          const at = labels[i];
          if (!at) return null;
          const selected = p.id === highlighted;
          return (
            <Marker
              key={p.id}
              longitude={at[0]}
              latitude={at[1]}
              style={{ zIndex: selected ? 2 : 1 }}
            >
              <ProposalMarker
                number={i + 1}
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
    </div>
  );
}
