import { useQuery } from "@tanstack/react-query";
import { type BBox, decodeLine, type LonLat } from "@wayline/domain";
import { bboxAround } from "@wayline/planner";
import { useThemeTokens } from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
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

/** Signed routes of the network around bbox as map lines. */
function useNetworkLines(bbox: BBox | undefined) {
  const { network } = useServices();
  return useQuery({
    queryKey: ["networkLines", bbox],
    enabled: !!bbox,
    staleTime: Infinity,
    queryFn: async (): Promise<FeatureCollection<LineString>> => {
      const graph = await network.network(bbox);
      return {
        type: "FeatureCollection",
        features: graph.edges
          .filter((e) => e.routes.length > 0)
          .map((e) => ({
            type: "Feature",
            properties: {},
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
 * Signed cycling routes around the given points as a quiet layer.
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
  if (!data) return null;
  return (
    <Source id="network" type="geojson" data={data}>
      <Layer
        id="network-line"
        beforeId={beforeId}
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-color": tokens.network,
          "line-width": subtle
            ? ["interpolate", ["linear"], ["zoom"], 8, 1.25, 12, 2.5]
            : ["interpolate", ["linear"], ["zoom"], 8, 1.25, 12, 3],
          "line-opacity": subtle ? 0.6 : 1,
        }}
      />
    </Source>
  );
}
