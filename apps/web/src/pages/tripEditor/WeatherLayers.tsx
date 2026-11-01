import { useThemeTokens, WIND_SPEED_STEPS } from "@wayline/ui";
import { useEffect, useMemo, useState } from "react";
import { Source, useMap } from "react-map-gl/maplibre";
import { MapLayer } from "../../components/map/AppMap";
import { rainImage, type WeatherField, windArrows } from "./weatherGrid";

const ARROW = "wind-arrow";
const ARROW_PX = 40;
/** Screen distance between wind arrows. */
const ARROW_SPACING_PX = 34;

/** Arrow pointing north, as a signed distance field so it can be tinted. */
function arrowImage(): ImageData | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = ARROW_PX;
  canvas.height = ARROW_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const c = ARROW_PX / 2;
  ctx.fillStyle = "#fff";
  ctx.fillRect(c - 1.75, 14, 3.5, 18);
  ctx.beginPath();
  ctx.moveTo(c, 6);
  ctx.lineTo(c + 7, 16);
  ctx.lineTo(c - 7, 16);
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

/** Zoom of the map, rounded so arrows only change at whole steps. */
function useZoomStep(): number {
  const { current: map } = useMap();
  const [zoom, setZoom] = useState(() => Math.round(map?.getZoom() ?? 9));
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(Math.round(map.getZoom()));
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);
  return zoom;
}

/** Rain as a data URL in the rain color. The map blends the pixels. */
function rainUrl(field: WeatherField, rgb: string): string | undefined {
  const image = rainImage(field);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  const [r, g, b] = rgb.match(/\d+/g)?.map(Number) ?? [];
  if (!ctx || r === undefined || g === undefined || b === undefined) {
    return undefined;
  }
  const data = ctx.createImageData(image.width, image.height);
  image.alpha.forEach((a, i) => {
    data.data.set([r, g, b, Math.round(a * 255)], i * 4);
  });
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL();
}

/**
 * Rain as a smooth field and wind as arrows of one length, colored by
 * speed. Arrows keep the same screen distance at every zoom.
 */
export function WeatherLayers({
  field,
  rain,
  wind,
}: {
  field: WeatherField;
  rain: boolean;
  wind: boolean;
}) {
  const tokens = useThemeTokens();
  useArrowImage();
  const zoom = useZoomStep();
  // Degrees of longitude per pixel at this zoom.
  const spacing = (ARROW_SPACING_PX * 360) / (512 * 2 ** zoom);
  const arrows = useMemo(() => windArrows(field, spacing), [field, spacing]);
  const url = useMemo(() => rainUrl(field, tokens.rain), [field, tokens.rain]);
  const coordinates = useMemo(() => rainImage(field).coordinates, [field]);

  return (
    <>
      {url && (
        <Source
          id="weather-rain"
          type="image"
          url={url}
          coordinates={coordinates}
        >
          <MapLayer
            id="weather-rain"
            type="raster"
            layout={{ visibility: rain ? "visible" : "none" }}
            paint={{
              "raster-resampling": "linear",
              "raster-fade-duration": 0,
            }}
          />
        </Source>
      )}
      <Source id="weather-wind" type="geojson" data={arrows}>
        <MapLayer
          id="weather-wind"
          type="symbol"
          layout={{
            visibility: wind ? "visible" : "none",
            "icon-image": ARROW,
            "icon-rotate": ["get", "windTo"],
            "icon-rotation-alignment": "map",
            "icon-size": 0.85,
            // Spaced evenly already. Labels and the route don't hide them.
            "icon-allow-overlap": true,
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
    </>
  );
}
