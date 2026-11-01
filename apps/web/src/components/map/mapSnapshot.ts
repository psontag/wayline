import type { LonLat } from "@wayline/domain";
import { thumbnailFit, useTheme } from "@wayline/ui";
import { useQuery } from "@tanstack/react-query";
import { Map as MapLibre } from "maplibre-gl";
import { boundsOf, mapStyles } from "./AppMap";

type Theme = keyof typeof mapStyles;

// One hidden map draws all snapshots, one after another. Browsers allow
// only a few WebGL contexts at a time.
let map: MapLibre | undefined;
let style: Theme | undefined;
let queue: Promise<unknown> = Promise.resolve();

function hiddenMap(): MapLibre {
  if (map) return map;
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${thumbnailFit.width}px;height:${thumbnailFit.height}px`;
  container.setAttribute("aria-hidden", "true");
  document.body.append(container);
  map = new MapLibre({
    container,
    interactive: false,
    attributionControl: false,
    pixelRatio: 2,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  return map;
}

async function draw(points: LonLat[], theme: Theme): Promise<string> {
  const m = hiddenMap();
  if (style !== theme) {
    const loaded = new Promise((resolve) => m.once("style.load", resolve));
    m.setStyle(mapStyles[theme]);
    style = theme;
    await loaded;
  }
  m.fitBounds(boundsOf(points), {
    padding: thumbnailFit.padding,
    animate: false,
  });
  const idle = new Promise((resolve) => m.once("idle", resolve));
  m.triggerRepaint();
  await idle;
  return m.getCanvas().toDataURL("image/jpeg", 0.85);
}

/** The map around a line as an image, fitted like a trip card thumbnail. */
function mapSnapshot(points: LonLat[], theme: Theme): Promise<string> {
  const next = queue.then(() => draw(points, theme));
  queue = next.catch(() => undefined);
  return next;
}

/** Map image for a trip card. Undefined while it is drawn. */
export function useMapSnapshot(points: LonLat[]): string | undefined {
  const { resolvedTheme } = useTheme();
  const { data } = useQuery({
    queryKey: ["mapSnapshot", resolvedTheme, points.join(";")],
    queryFn: () => mapSnapshot(points, resolvedTheme),
    enabled: points.length > 1,
    staleTime: Infinity,
    retry: false,
  });
  return data;
}
