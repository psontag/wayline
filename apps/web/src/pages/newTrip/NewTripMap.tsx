import { useQuery } from "@tanstack/react-query";
import type { Place } from "@wayline/domain";
import { EndpointMarker, useThemeTokens } from "@wayline/ui";
import type { FeatureCollection, Polygon } from "geojson";
import { useTranslation } from "react-i18next";
import { Marker, Source } from "react-map-gl/maplibre";
import { AppMap, MapLayer } from "../../components/map/AppMap";
import { useServices } from "../../data/ServicesProvider";

/** The area the test network covers. */
function useNetworkArea() {
  const { network } = useServices();
  return useQuery({
    queryKey: ["newTrip", "networkArea"],
    staleTime: Infinity,
    queryFn: async (): Promise<FeatureCollection<Polygon>> => {
      const [w, s, e, n] = (await network.manifest()).region.bbox;
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [w, s],
                  [e, s],
                  [e, n],
                  [w, n],
                  [w, s],
                ],
              ],
            },
          },
        ],
      };
    },
  });
}

export function NewTripMap({
  start,
  end,
}: {
  start: Place | null;
  end: Place | null;
}) {
  const { t } = useTranslation("newTrip");
  const tokens = useThemeTokens();
  const area = useNetworkArea();
  const places = [start, end].filter((p): p is Place => p !== null);

  return (
    <AppMap
      label={t("map.label")}
      fit={places.map((p) => p.coord)}
      network="full"
      hiddenLabels={places.map((p) => p.name)}
      legend={[{ label: t("map.area"), line: "dashed" }]}
    >
      {area.data && (
        <Source id="area" type="geojson" data={area.data}>
          <MapLayer
            id="area-outline"
            type="line"
            paint={{
              "line-color": tokens.textMuted,
              "line-width": 1.5,
              "line-dasharray": [4, 3],
            }}
          />
        </Source>
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
