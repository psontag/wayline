import { useTheme, useThemeTokens } from "@wayline/ui";
import type { PropertyValueSpecification } from "maplibre-gl";
import { Layer, Source } from "react-map-gl/maplibre";

// Free elevation tiles, no key needed.
const terrainTiles = [
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
];
// Stronger when zoomed out, where the relief looks flat.
const strength = {
  light: ["interpolate", ["linear"], ["zoom"], 7, 0.6, 12, 0.35],
  dark: ["interpolate", ["linear"], ["zoom"], 7, 0.55, 12, 0.4],
} satisfies Record<"light" | "dark", PropertyValueSpecification<number>>;

/** Soft terrain shading below the routes. */
export function HillshadeLayer({ beforeId }: { beforeId?: string }) {
  const { resolvedTheme } = useTheme();
  const tokens = useThemeTokens();
  return (
    <Source
      id="terrain"
      type="raster-dem"
      tiles={terrainTiles}
      encoding="terrarium"
      tileSize={256}
      maxzoom={15}
    >
      <Layer
        id="hillshade"
        beforeId={beforeId}
        type="hillshade"
        paint={{
          "hillshade-shadow-color": tokens.hillshadeShadow,
          "hillshade-highlight-color": tokens.hillshadeHighlight,
          "hillshade-accent-color": tokens.hillshadeShadow,
          "hillshade-exaggeration": strength[resolvedTheme],
          "hillshade-illumination-anchor": "map",
        }}
      />
    </Source>
  );
}
