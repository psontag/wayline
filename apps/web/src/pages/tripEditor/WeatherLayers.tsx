import { useThemeTokens, WIND_SPEED_STEPS } from "@wayline/ui";
import type { FeatureCollection, Point } from "geojson";
import { useEffect } from "react";
import { Source, useMap } from "react-map-gl/maplibre";
import { MapLayer } from "../../components/map/AppMap";
import type { WeatherPointProps } from "./weatherGrid";

const ARROW = "wind-arrow";
const ARROW_PX = 48;

/** Arrow pointing north, as a signed distance field so it can be tinted. */
function arrowImage(): ImageData | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = ARROW_PX;
  canvas.height = ARROW_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const c = ARROW_PX / 2;
  ctx.fillStyle = "#fff";
  ctx.fillRect(c - 3, 18, 6, 26);
  ctx.beginPath();
  ctx.moveTo(c, 4);
  ctx.lineTo(c + 11, 20);
  ctx.lineTo(c - 11, 20);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, ARROW_PX, ARROW_PX);
}

/** The arrow icon. A style swap drops images, so add it again then. */
function useArrowImage() {
  const { current: map } = useMap();
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    const add = () => {
      if (m.hasImage(ARROW)) return;
      const image = arrowImage();
      if (image) m.addImage(ARROW, image, { sdf: true, pixelRatio: 2 });
    };
    add();
    m.on("styledata", add);
    return () => {
      m.off("styledata", add);
    };
  }, [map]);
}

/** "rgb(1, 2, 3)" with an alpha. */
function withAlpha(rgb: string, alpha: number): string {
  return rgb.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
}

/**
 * Rain as a soft field and wind as arrows of one length, colored by speed.
 * Arrows that would overlap are left out, so they stay calm at any zoom.
 */
export function WeatherLayers({
  points,
  rain,
  wind,
}: {
  points: FeatureCollection<Point, WeatherPointProps>;
  rain: boolean;
  wind: boolean;
}) {
  const tokens = useThemeTokens();
  useArrowImage();
  return (
    <Source id="weather" type="geojson" data={points}>
      <MapLayer
        id="weather-rain"
        type="heatmap"
        layout={{ visibility: rain ? "visible" : "none" }}
        paint={{
          // 2 mm in an hour is steady rain.
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "rain"],
            0,
            0,
            2,
            1,
          ],
          // About two forecast cells wide, so neighbors blend.
          "heatmap-radius": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            5,
            4,
            9,
            60,
            13,
            960,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            withAlpha(tokens.rain, 0),
            0.05,
            withAlpha(tokens.rain, 0.2),
            0.4,
            withAlpha(tokens.rain, 0.4),
            1,
            withAlpha(tokens.rain, 0.65),
          ],
        }}
      />
      <MapLayer
        id="weather-wind"
        type="symbol"
        layout={{
          visibility: wind ? "visible" : "none",
          "icon-image": ARROW,
          "icon-rotate": ["get", "windTo"],
          "icon-rotation-alignment": "map",
          "icon-padding": 10,
          "icon-ignore-placement": true,
        }}
        paint={{
          "icon-color": [
            "step",
            ["get", "windSpeed"],
            tokens.windSpeed1,
            WIND_SPEED_STEPS[0],
            tokens.windSpeed2,
            WIND_SPEED_STEPS[1],
            tokens.windSpeed3,
            WIND_SPEED_STEPS[2],
            tokens.windSpeed4,
          ],
          "icon-halo-color": tokens.surface,
          "icon-halo-width": 1,
        }}
      />
    </Source>
  );
}
