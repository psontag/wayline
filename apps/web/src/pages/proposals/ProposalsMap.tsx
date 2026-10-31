import { decodeLine, type Place, type Proposal } from "@wayline/domain";
import {
  EndpointMarker,
  RouteLabel,
  StopMarker,
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
} from "react-map-gl/maplibre";
import { AppMap, MapLayer, type MapPadding } from "../../components/map/AppMap";
import { labelPoints, tripPoints } from "./proposalView";
import { flavourOf, routeColorKey, routeColorToken } from "./routeColor";

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
  /** Small map on phones: less padding, no zoom buttons. */
  compact?: boolean;
};

/** Phones: room on both sides for route and place labels. */
const compactPadding: MapPadding = { top: 40, right: 80, bottom: 40, left: 72 };

/** All proposals on one map, each in its own color. */
export function ProposalsMap({
  proposals,
  places,
  highlighted,
  highlightedDay,
  onSelect,
  compact = false,
}: ProposalsMapProps) {
  const { t } = useTranslation("proposals");
  const tokens = useThemeTokens();

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

  // Show everything whenever a proposal comes in.
  const fit = useMemo(
    () => [...routes.flat().map((p) => p.coord), ...ends.map((p) => p.coord)],
    [routes, ends],
  );
  const fitKey = [proposals.map((p) => p.id), ends.map((p) => p.name)];

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
      networkAround={stopCoords}
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
            "line-width": 9,
            "line-opacity": dayOpacity(0.15),
          }}
        />
        <MapLayer
          id="day-line"
          type="line"
          layout={lineLayout}
          paint={{
            "line-color": shownColor,
            "line-width": 6,
            "line-opacity": dayOpacity(0.4),
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
    </AppMap>
  );
}
