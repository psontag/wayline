import { useQuery } from "@tanstack/react-query";
import { decodeLine } from "@wayline/domain";
import { useThemeTokens } from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { Layer, Source } from "react-map-gl/maplibre";
import { useServices } from "../data/ServicesProvider";

/** Signed routes of the network as map lines. */
function useNetworkLines() {
  const { network } = useServices();
  return useQuery({
    queryKey: ["networkLines"],
    staleTime: Infinity,
    queryFn: async (): Promise<FeatureCollection<LineString>> => {
      const graph = await network.network();
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
 * Signed cycling routes as a quiet layer. beforeId keeps it below our
 * route lines, since it may load after them.
 */
export function NetworkLayer({ beforeId }: { beforeId?: string }) {
  const tokens = useThemeTokens();
  const { data } = useNetworkLines();
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 12, 4],
        }}
      />
    </Source>
  );
}
