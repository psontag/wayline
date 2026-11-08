import {
  decodeLine,
  type LonLat,
  type Place,
  type Proposal,
} from "@wayline/domain";
import {
  EndpointMarker,
  WindMarker,
  RouteLabel,
  StopMarker,
  useFormat,
  useThemeTokens,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import type {
  DataDrivenPropertyValueSpecification,
  FilterSpecification,
} from "maplibre-gl";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Layer,
  type MapLayerMouseEvent,
  Marker,
  Source,
  useMap,
} from "react-map-gl/maplibre";
import { AppMap, MapLayer, type MapPadding } from "../../components/map/AppMap";
import {
  centerBox,
  type Cut,
  labelBox,
  placeLabels,
  useZoom,
} from "../../components/map/labels";
import { labelPoints, tripPoints } from "./proposalView";
import { routeColorAt } from "./routeColor";

const lineLayout = { "line-cap": "round", "line-join": "round" } as const;

export type ProposalsMapProps = {
  proposals: Proposal[];
  /** Start and end of the request, shown before any proposal is there. */
  places: Place[];
  /** Proposal shown on top, e.g. the selected or hovered one. */
  highlighted?: string;
  /** Day of the highlighted proposal to show at full strength. */
  highlightedDay?: number;
  /** Proposal the user picked. The map zooms to it. */
  focused?: string;
  onSelect: (id: string) => void;
  /** Small map on phones: less padding, no zoom buttons. */
  compact?: boolean;
  /** Wind of the ride, shown at the start. km/h and degrees it comes from. */
  wind?: { from: number; speed: number; at: LonLat };
};

/** Phones: room on both sides for route and place labels. */
const compactPadding: MapPadding = { top: 40, right: 80, bottom: 40, left: 72 };

/** All proposals on one map, each in its own color. */
export function ProposalsMap({
  proposals,
  places,
  highlighted,
  highlightedDay,
  focused,
  onSelect,
  compact = false,
  wind,
}: ProposalsMapProps) {
  const { t } = useTranslation("proposals");
  const format = useFormat();
  const tokens = useThemeTokens();

  const routes = useMemo(
    () => proposals.map((p) => tripPoints(p.trip)),
    [proposals],
  );

  const colors = useMemo(
    () => proposals.map((_, i) => tokens[routeColorAt(i)]),
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
          color: colors[i] ?? tokens.route1,
        },
        geometry: {
          type: "LineString",
          coordinates: (routes[i] ?? []).map((point) => point.coord),
        },
      })),
    }),
    [proposals, routes, highlighted, colors, tokens.route1],
  );

  // The highlighted proposal day by day, so one day can stand out.
  const shownIndex = proposals.findIndex((p) => p.id === highlighted);
  const shown = proposals[shownIndex];
  const shownColor = colors[shownIndex] ?? tokens.route1;
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

  // Starts and ends of all proposals. A homeward ride starts far away.
  const ends = useMemo(() => {
    if (!proposals.length) return places;
    const out = new Map<string, Place>();
    for (const p of proposals) {
      for (const place of [
        p.trip.stages[0]?.start,
        p.trip.stages.at(-1)?.end,
      ]) {
        if (place && !out.has(place.name)) out.set(place.name, place);
      }
    }
    return [...out.values()];
  }, [proposals, places]);

  const stopCoords = useMemo(
    () => [
      ...places.map((p) => p.coord),
      ...proposals.flatMap((p) => p.trip.stages.map((s) => s.end.coord)),
    ],
    [proposals, places],
  );

  const labels = useMemo(
    () => labelPoints(routes, stopCoords),
    [routes, stopCoords],
  );

  // Zoom to the picked proposal. Otherwise show everything whenever a
  // proposal comes in.
  const focusedIndex = proposals.findIndex((p) => p.id === focused);
  const fit = useMemo(
    () =>
      focusedIndex >= 0
        ? (routes[focusedIndex] ?? []).map((p) => p.coord)
        : [...routes.flat().map((p) => p.coord), ...ends.map((p) => p.coord)],
    [routes, ends, focusedIndex],
  );
  const fitKey =
    focusedIndex >= 0
      ? focused
      : [proposals.map((p) => p.id), ends.map((p) => p.name)];

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
    <AppMap
      label={t("map.label")}
      fit={fit}
      fitKey={fitKey}
      hiddenLabels={ends.map((p) => p.name)}
      interactiveLayerIds={["proposal-hit"]}
      onClick={onClick}
      {...(compact && { padding: compactPadding, controls: false })}
    >
      <Source id="proposals" type="geojson" data={data}>
        <MapLayer
          id="proposal-line"
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
        <MapLayer
          id="day-casing"
          type="line"
          layout={lineLayout}
          paint={{
            "line-color": tokens.routeOutline,
            "line-width": 7,
            "line-opacity": dayOpacity(0.15),
          }}
        />
        <MapLayer
          id="day-line"
          type="line"
          layout={lineLayout}
          paint={{
            "line-color": shownColor,
            "line-width": 4.5,
            "line-opacity": dayOpacity(0.4),
          }}
        />
      </Source>

      {wind && (
        <Marker
          longitude={wind.at[0]}
          latitude={wind.at[1]}
          anchor="right"
          offset={[-18, 0]}
        >
          <WindMarker
            from={wind.from}
            speed={wind.speed}
            label={t("map.wind", { speed: format.speed(wind.speed) })}
          />
        </Marker>
      )}
      <ProposalMarkers
        proposals={proposals}
        ends={ends}
        shown={shown}
        highlighted={highlighted}
        labels={labels}
        onSelect={onSelect}
      />
    </AppMap>
  );
}

/**
 * Ends, stops of the shown proposal and route numbers. When they run into
 * each other, the selected route number wins, then ends, then stops (they
 * lose their name), then the other route numbers (they hide).
 */
function ProposalMarkers({
  proposals,
  ends,
  shown,
  highlighted,
  labels,
  onSelect,
}: {
  proposals: Proposal[];
  ends: Place[];
  shown: Proposal | undefined;
  highlighted: string | undefined;
  labels: LonLat[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation("proposals");
  const { current: map } = useMap();
  const zoom = useZoom(map);
  const stops = useMemo(() => shown?.trip.stages.slice(0, -1) ?? [], [shown]);

  // Ends and stops lose their name when crowded, route numbers hide.
  const crowded = useMemo(() => {
    if (!map) return new Map<string, Cut>();
    const at = (coord: LonLat) => map.project(coord);
    return placeLabels([
      ...ends.map((place) => {
        const { x, y } = at(place.coord);
        return {
          id: `end-${place.name}`,
          priority: 1,
          box: labelBox(x, y, 12, place.name.length),
          core: labelBox(x, y, 12),
          fixed: true,
        };
      }),
      ...stops.map((stage) => {
        const { x, y } = at(stage.end.coord);
        return {
          id: `stop-${stage.id}`,
          priority: 2,
          box: labelBox(x, y, 16, stage.end.name.length),
          core: labelBox(x, y, 16),
          fixed: true,
        };
      }),
      ...proposals.flatMap((p, i) => {
        const coord = labels[i];
        if (!coord) return [];
        const { x, y } = at(coord);
        return [
          {
            id: `route-${p.id}`,
            priority: p.id === highlighted ? 0 : 3,
            box: centerBox(x, y, 24, 22),
          },
        ];
      }),
    ]);
    // zoom only triggers a new measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zoom, ends, stops, proposals, labels, highlighted]);

  return (
    <>
      {ends.map((place) => (
        <Marker
          key={place.name}
          longitude={place.coord[0]}
          latitude={place.coord[1]}
          anchor="left"
          offset={[-12, 0]}
        >
          <EndpointMarker
            {...(!crowded.has(`end-${place.name}`) && { name: place.name })}
            station={place.kind === "station"}
          />
        </Marker>
      ))}
      {shown &&
        stops.map((stage, i) => (
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
              {...(!crowded.has(`stop-${stage.id}`) && {
                name: stage.end.name,
              })}
              aria-label={t("map.stop", { day: i + 1, place: stage.end.name })}
              onClick={() => onSelect(shown.id)}
            />
          </Marker>
        ))}
      {proposals.map((p, i) => {
        const at = labels[i];
        if (!at || crowded.has(`route-${p.id}`)) return null;
        const selected = p.id === highlighted;
        return (
          <Marker
            key={p.id}
            longitude={at[0]}
            latitude={at[1]}
            style={{ zIndex: selected ? 2 : 1 }}
          >
            <RouteLabel
              label={String(i + 1)}
              color={routeColorAt(i)}
              selected={selected}
              aria-label={t("map.select", { number: i + 1 })}
              onClick={() => onSelect(p.id)}
            />
          </Marker>
        );
      })}
    </>
  );
}
