import { useQuery } from "@tanstack/react-query";
import type { BBox, LonLat, NetworkClass } from "@wayline/domain";
import { bboxAround } from "@wayline/planner";
import {
  type NetworkRank,
  NetworkRouteCard,
  useThemeTokens,
} from "@wayline/ui";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useState } from "react";
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

const CLASSES: NetworkClass[] = ["icn", "ncn", "rcn", "lcn", "connector"];

/** Line tiles and route table of the data, loaded once. */
function useRouteLines() {
  const { lines } = useServices();
  return useQuery({
    queryKey: ["routeLines"],
    staleTime: Infinity,
    queryFn: lines,
  });
}

/**
 * Big routes first: EuroVelo and national routes always, regional ones
 * from zoom 8, local ones from zoom 11. The line tiles hold each class
 * from the same zoom on.
 */
const levels = [
  { id: "network-major", classes: ["icn", "ncn"], minzoom: 0 },
  { id: "network-regional", classes: ["rcn"], minzoom: 8 },
  { id: "network-local", classes: ["lcn", "connector"], minzoom: 11 },
] as const;

const LAYER_IDS = levels.map((l) => l.id);

type Hovered = { ids: number[]; at: LonLat };

/**
 * Signed cycling routes as a quiet layer, wherever the map is. Hover or
 * tap a line to see the route's name and length and to highlight it.
 * beforeId keeps it below our route lines, since it may load after them.
 * subtle makes it fainter, for maps where the routes matter more.
 */
export function NetworkLayer({
  beforeId,
  subtle = false,
}: {
  beforeId?: string;
  subtle?: boolean;
}) {
  const tokens = useThemeTokens();
  const { data } = useRouteLines();
  const hovered = useHoveredRoute(!!data);

  if (!data) return null;
  // Biggest class first, then most km on this line.
  const [main, ...others] = (hovered?.ids ?? [])
    .flatMap((id) => {
      const route = data.routes.get(id);
      return route ? [route] : [];
    })
    .sort((a, b) => CLASSES.indexOf(a.network) - CLASSES.indexOf(b.network));
  const opacity = subtle ? 0.6 : 1;

  return (
    <>
      <Source
        id="network"
        type="vector"
        tiles={[data.tiles]}
        minzoom={data.minzoom}
        maxzoom={data.maxzoom}
        bounds={data.bounds}
      >
        {levels.map((level) => (
          <Layer
            key={level.id}
            id={level.id}
            beforeId={beforeId}
            source-layer="routes"
            type="line"
            minzoom={level.minzoom}
            filter={["in", ["get", "network"], ["literal", level.classes]]}
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
          source-layer="routes"
          type="line"
          filter={["in", `|${main?.id ?? ""}|`, ["get", "routes"]]}
          layout={{
            "line-cap": "round",
            "line-join": "round",
            visibility: main ? "visible" : "none",
          }}
          paint={{
            "line-color": tokens.network,
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 6],
          }}
        />
      </Source>
      {hovered && main && (
        <Marker
          longitude={hovered.at[0]}
          latitude={hovered.at[1]}
          anchor="bottom"
          offset={[0, -10]}
          style={{ zIndex: 6, pointerEvents: "none" }}
        >
          <NetworkRouteCard
            name={main.name}
            rank={ranks[main.network]}
            length={main.lengthKm * 1000}
            others={others.map((r) => r.name)}
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
      const ids = String(event.features?.[0]?.properties?.routes ?? "")
        .split("|")
        .filter(Boolean)
        .map(Number);
      setHovered(
        ids.length
          ? { ids, at: [event.lngLat.lng, event.lngLat.lat] }
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
