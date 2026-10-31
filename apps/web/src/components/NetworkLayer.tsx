import { useQuery } from "@tanstack/react-query";
import {
  type BBox,
  decodeLine,
  type LonLat,
  type NetworkClass,
} from "@wayline/domain";
import { bboxAround } from "@wayline/planner";
import {
  type NetworkRank,
  NetworkRouteCard,
  useThemeTokens,
} from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/maplibre";
import { useServices } from "../data/ServicesProvider";

/** Grid the network area snaps to, so nearby views share one query. */
const GRID = 0.5;

/** Network area around points, snapped outward to the grid. */
export function networkArea(points: LonLat[], km = 15): BBox | undefined {
  if (!points.length) return undefined;
  const [w, s, e, n] = bboxAround(points, km);
  const down = (x: number) => Math.floor(x / GRID) * GRID;
  const up = (x: number) => Math.ceil(x / GRID) * GRID;
  return [down(w), down(s), up(e), up(n)];
}

const ranks: Record<NetworkClass, NetworkRank> = {
  icn: "international",
  ncn: "national",
  rcn: "regional",
  lcn: "local",
  connector: "local",
};

type NetworkProps = {
  rank: NetworkRank;
  /** Main route name. */
  name: string;
  /** All route names as "|a|b|", so a filter can find one by "|a|". */
  names: string;
  lengthKm: number;
};

/** Signed routes of the network around bbox as map lines. */
function useNetworkLines(bbox: BBox | undefined) {
  const { network } = useServices();
  return useQuery({
    queryKey: ["networkLines", bbox],
    enabled: !!bbox,
    staleTime: Infinity,
    queryFn: async (): Promise<FeatureCollection<LineString, NetworkProps>> => {
      const graph = await network.network(bbox);
      return {
        type: "FeatureCollection",
        features: graph.edges
          .filter((e) => e.routes.length > 0)
          .map((e) => ({
            type: "Feature",
            properties: {
              rank: ranks[e.network],
              name: e.routes[0] ?? "",
              names: `|${e.routes.join("|")}|`,
              lengthKm: e.lengthKm,
            },
            geometry: {
              type: "LineString",
              coordinates: decodeLine(e.geometry),
            },
          })),
      };
    },
  });
}

/**
 * Big routes first: EuroVelo and national routes always, regional ones
 * from zoom 9, local ones from zoom 11.
 */
const levels = [
  { id: "network-major", ranks: ["international", "national"], minzoom: 0 },
  { id: "network-regional", ranks: ["regional"], minzoom: 9 },
  { id: "network-local", ranks: ["local"], minzoom: 11 },
] as const;

const LAYER_IDS = levels.map((l) => l.id);

type Hovered = { names: string[]; at: LonLat };

/**
 * Signed cycling routes around the given points as a quiet layer. Hover
 * or tap a line to see the route's name and length and to highlight it.
 * beforeId keeps it below our route lines, since it may load after them.
 * subtle makes it fainter, for maps where the routes matter more.
 */
export function NetworkLayer({
  around,
  beforeId,
  subtle = false,
}: {
  around: LonLat[];
  beforeId?: string;
  subtle?: boolean;
}) {
  const tokens = useThemeTokens();
  const { data } = useNetworkLines(networkArea(around));
  const hovered = useHoveredRoute(!!data);
  const name = hovered?.names[0];

  const lengthKm = useMemo(() => {
    if (!data || !name) return 0;
    return data.features
      .filter((f) => f.properties.names.includes(`|${name}|`))
      .reduce((sum, f) => sum + f.properties.lengthKm, 0);
  }, [data, name]);

  if (!data) return null;
  const rank =
    name &&
    data.features.find((f) => f.properties.name === name)?.properties.rank;
  const opacity = subtle ? 0.6 : 1;

  return (
    <>
      <Source id="network" type="geojson" data={data}>
        {levels.map((level) => (
          <Layer
            key={level.id}
            id={level.id}
            beforeId={beforeId}
            type="line"
            minzoom={level.minzoom}
            filter={["in", ["get", "rank"], ["literal", level.ranks]]}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": tokens.network,
              "line-width": lineWidth(level.id),
              "line-opacity":
                level.id === "network-major" ? opacity : opacity * 0.8,
            }}
          />
        ))}
        <Layer
          id="network-hover"
          beforeId={beforeId}
          type="line"
          filter={["in", `|${name ?? ""}|`, ["get", "names"]]}
          layout={{
            "line-cap": "round",
            "line-join": "round",
            visibility: name ? "visible" : "none",
          }}
          paint={{
            "line-color": tokens.network,
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 6],
          }}
        />
      </Source>
      {hovered && name && rank && (
        <Marker
          longitude={hovered.at[0]}
          latitude={hovered.at[1]}
          anchor="bottom"
          offset={[0, -10]}
          style={{ zIndex: 6, pointerEvents: "none" }}
        >
          <NetworkRouteCard
            name={name}
            rank={rank}
            length={lengthKm * 1000}
            others={hovered.names.slice(1)}
          />
        </Marker>
      )}
    </>
  );
}

function lineWidth(id: (typeof LAYER_IDS)[number]) {
  const [low, high] =
    id === "network-major"
      ? [2, 4]
      : id === "network-regional"
        ? [1.25, 3]
        : [1, 2];
  return ["interpolate", ["linear"], ["zoom"], 8, low, 12, high] as [
    "interpolate",
    ["linear"],
    ["zoom"],
    number,
    number,
    number,
    number,
  ];
}

/** The route under the pointer, or the last tapped one. */
function useHoveredRoute(ready: boolean): Hovered | undefined {
  const { current: ref } = useMap();
  const [hovered, setHovered] = useState<Hovered>();

  useEffect(() => {
    const map = ref?.getMap();
    if (!map || !ready) return;
    const hide = () => setHovered(undefined);
    const show = (event: MapLayerMouseEvent) => {
      // Our own route lines lie above the network. Under them, stay quiet.
      const topLine = map
        .queryRenderedFeatures(event.point)
        .find((f) => f.layer.type === "line");
      if (topLine && topLine.source !== "network") return hide();
      const names = String(event.features?.[0]?.properties?.names ?? "")
        .split("|")
        .filter(Boolean);
      setHovered(
        names.length
          ? { names, at: [event.lngLat.lng, event.lngLat.lat] }
          : undefined,
      );
    };
    // A tap elsewhere hides the card on touch screens.
    const tap = (event: { point: { x: number; y: number } }) => {
      const layers = LAYER_IDS.filter((id) => map.getLayer(id));
      if (
        !map.queryRenderedFeatures([event.point.x, event.point.y], { layers })
          .length
      ) {
        hide();
      }
    };
    for (const id of LAYER_IDS) {
      map.on("mousemove", id, show);
      map.on("click", id, show);
      map.on("mouseleave", id, hide);
    }
    map.on("click", tap);
    return () => {
      for (const id of LAYER_IDS) {
        map.off("mousemove", id, show);
        map.off("click", id, show);
        map.off("mouseleave", id, hide);
      }
      map.off("click", tap);
    };
  }, [ref, ready]);

  return hovered;
}
