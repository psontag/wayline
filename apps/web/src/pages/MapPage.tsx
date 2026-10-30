import { useThemeTokens } from "@wayline/ui";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { useTranslation } from "react-i18next";
import { Source } from "react-map-gl/maplibre";
import { AppMap, MapLayer } from "../components/map/AppMap";

type LngLat = [number, number];

// Hand-drawn demo: Bamberg, up the Main valley to Lichtenfels, then to Coburg.
const bamberg: LngLat = [10.8869, 49.8917];
const coburg: LngLat = [10.9636, 50.2581];

const demoCoordinates: LngLat[] = [
  bamberg,
  [10.8794, 49.9306],
  [10.8878, 49.9714],
  [10.9264, 50.0244],
  [10.9542, 50.0639],
  [11.0033, 50.1028],
  [11.0592, 50.1453],
  [11.0614, 50.1781],
  [11.0583, 50.2075],
  [11.0115, 50.2347],
  coburg,
];

const demoRoute: Feature<LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: demoCoordinates },
};

const demoStops: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [bamberg, coburg].map((coordinates) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates },
  })),
};

export function MapPage() {
  const { t } = useTranslation("map");
  const tokens = useThemeTokens();

  return (
    <div className="relative min-h-0 flex-1">
      <AppMap label={t("label")} fit={demoCoordinates}>
        <Source id="demo-route" type="geojson" data={demoRoute}>
          <MapLayer
            id="demo-route-casing"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": tokens.routeCasing, "line-width": 9 }}
          />
          <MapLayer
            id="demo-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": tokens.route, "line-width": 5 }}
          />
        </Source>
        <Source id="demo-stops" type="geojson" data={demoStops}>
          <MapLayer
            id="demo-stops"
            type="circle"
            paint={{
              "circle-radius": 6,
              "circle-color": tokens.marker,
              "circle-stroke-color": tokens.surface,
              "circle-stroke-width": 2,
            }}
          />
        </Source>
      </AppMap>
    </div>
  );
}
