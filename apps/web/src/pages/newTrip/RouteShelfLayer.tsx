import { decodeLine } from "@wayline/domain";
import { useThemeTokens } from "@wayline/ui";
import type { FeatureCollection, LineString } from "geojson";
import { useMemo } from "react";
import { Source } from "react-map-gl/maplibre";
import { MapLayer } from "../../components/map/AppMap";
import { partLine, type ShelfRoute } from "./routeShelf";

const lineLayout = { "line-cap": "round", "line-join": "round" } as const;

/**
 * A signed route from the route shelf, and its stretch when it is selected.
 * Drawn from route-stations.json: regional route lines only show from zoom 8.
 */
export function RouteShelfLayer({
  route,
  selected,
}: {
  route: ShelfRoute;
  selected: boolean;
}) {
  const tokens = useThemeTokens();
  const whole = useMemo(
    (): FeatureCollection<LineString> => ({
      type: "FeatureCollection",
      features: route.parts.map((p) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: decodeLine(p.line) },
      })),
    }),
    [route],
  );
  const stretch = useMemo((): FeatureCollection<LineString> => {
    const s = route.stretch;
    const part = s && route.parts[s.part];
    return {
      type: "FeatureCollection",
      features:
        selected && s && part
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: partLine(part, s.from.km, s.to.km),
                },
              },
            ]
          : [],
    };
  }, [route, selected]);

  return (
    <>
      <Source id="shelf-route" type="geojson" data={whole}>
        <MapLayer
          id="shelf-route-line"
          type="line"
          layout={lineLayout}
          paint={{
            "line-color": tokens.routeHighlight,
            "line-width": 4,
            "line-opacity": 0.6,
          }}
        />
      </Source>
      <Source id="shelf-stretch" type="geojson" data={stretch}>
        <MapLayer
          id="shelf-stretch-casing"
          type="line"
          layout={lineLayout}
          paint={{ "line-color": tokens.routeCasing, "line-width": 9 }}
        />
        <MapLayer
          id="shelf-stretch-line"
          type="line"
          layout={lineLayout}
          paint={{ "line-color": tokens.route, "line-width": 5 }}
        />
      </Source>
    </>
  );
}
