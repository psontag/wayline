import type { Area } from "@wayline/domain";
import { useFormat, useThemeTokens } from "@wayline/ui";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { MapLayer } from "../../components/map/AppMap";
import { type AreaReach, areaShape } from "./areas";
import { reachBand } from "./reach";

export const AREA_LAYER = "areas";

/** Fonts of the base map styles. */
const LABEL_FONT = ["Noto Sans Bold"];

// Outlines are decoded once per area, not on every filter change.
const shapes = new WeakMap<Area, MultiPolygon>();
function shapeOf(area: Area): MultiPolygon {
  let shape = shapes.get(area);
  if (!shape) {
    shape = areaShape(area);
    shapes.set(area, shape);
  }
  return shape;
}

/** What colors the areas: train time from home, or rain on the trip days. */
export type AreaColor = "reach" | "weather";

/** Tourism regions colored by train time or weather. A click on one picks it. */
export function AreaLayer({
  areas,
  attribution,
  color = "reach",
  picked,
  hovered,
}: {
  areas: AreaReach[];
  attribution: string;
  color?: AreaColor;
  /** Id of the picked area. The others fade and lose their labels. */
  picked?: string;
  /** Id of the area under the pointer, on the map or in the list. */
  hovered?: string;
}) {
  const tokens = useThemeTokens();
  const format = useFormat();
  const shapesData = useMemo(
    (): FeatureCollection<MultiPolygon> => ({
      type: "FeatureCollection",
      features: areas.map(({ area, reach, over, rain }) => ({
        type: "Feature",
        properties: {
          id: area.id,
          band: (reach && reachBand(reach.minutes)) ?? 0,
          over,
          rain: rain ?? "",
        },
        geometry: shapeOf(area),
      })),
    }),
    [areas],
  );
  const labelData = useMemo(
    (): FeatureCollection<Point> => ({
      type: "FeatureCollection",
      features: areas.map(({ area, reach, over }) => ({
        type: "Feature",
        properties: {
          name: area.name,
          time: reach ? format.duration(reach.minutes / 60) : "",
          over,
          minutes: reach?.minutes ?? 9999,
        },
        geometry: { type: "Point", coordinates: area.label },
      })),
    }),
    [areas, format],
  );

  const isPicked: ExpressionSpecification = ["==", ["get", "id"], picked ?? ""];
  const highlight = [picked, hovered].filter((id): id is string => !!id);

  return (
    <>
      <Source
        id={AREA_LAYER}
        type="geojson"
        data={shapesData}
        attribution={attribution}
      >
        <MapLayer
          id={AREA_LAYER}
          type="fill"
          paint={{
            "fill-color":
              color === "weather"
                ? [
                    "match",
                    ["get", "rain"],
                    "dry",
                    tokens.weatherDry,
                    "showers",
                    tokens.weatherShowers,
                    "wet",
                    tokens.weatherWet,
                    tokens.textMuted,
                  ]
                : [
                    "match",
                    ["get", "band"],
                    1,
                    tokens.reach1,
                    2,
                    tokens.reach2,
                    3,
                    tokens.reach3,
                    4,
                    tokens.reach4,
                    5,
                    tokens.reach5,
                    tokens.textMuted,
                  ],
            // Over 6 h: no fill, the base map shows through. By weather,
            // areas over the max time are grey.
            "fill-opacity": [
              "case",
              ["==", ["get", "band"], 0],
              0,
              ...(picked ? [isPicked, 0.2, true, 0.08] : []),
              ["get", "over"],
              color === "weather" ? 0.12 : 0.2,
              color === "weather" ? 0.7 : 0.6,
            ] as ExpressionSpecification,
          }}
        />
        <MapLayer
          id={`${AREA_LAYER}-border`}
          type="line"
          paint={{
            "line-color": tokens.surface,
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 2],
          }}
        />
        <MapLayer
          id={`${AREA_LAYER}-highlight`}
          type="line"
          filter={["in", ["get", "id"], ["literal", highlight]]}
          paint={{
            "line-color": tokens.selectedBorder,
            "line-width": 2,
          }}
        />
      </Source>
      <Source id={`${AREA_LAYER}-labels`} type="geojson" data={labelData}>
        {/* Above the base map labels, so area names win the space. */}
        <Layer
          id={`${AREA_LAYER}-labels`}
          type="symbol"
          layout={{
            visibility: picked ? "none" : "visible",
            "symbol-sort-key": ["get", "minutes"],
            "text-field": [
              "format",
              ["get", "name"],
              {},
              "\n",
              {},
              ["get", "time"],
              { "font-scale": 0.85 },
            ],
            "text-font": LABEL_FONT,
            "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 13],
            "text-max-width": 8,
            "text-padding": 4,
          }}
          paint={{
            "text-color": [
              "case",
              ["get", "over"],
              tokens.textMuted,
              tokens.text,
            ],
            "text-halo-color": tokens.surface,
            "text-halo-width": 1.5,
          }}
        />
      </Source>
    </>
  );
}
