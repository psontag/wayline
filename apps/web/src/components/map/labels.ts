import { useEffect, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

/** Screen box in pixels. */
export type Box = { left: number; right: number; top: number; bottom: number };

export function overlaps(a: Box, b: Box) {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

/**
 * Box of a round marker with its label to the right, as the markers with
 * anchor "left" draw it. Text width is a rough guess from the length.
 */
export function labelBox(
  x: number,
  y: number,
  radius: number,
  chars = 0,
  charPx = 7.5,
): Box {
  return {
    left: x - radius,
    right: x + radius + (chars ? 6 + chars * charPx : 0),
    top: y - radius,
    bottom: y + radius,
  };
}

/** Box of a marker centered on its point. */
export function centerBox(
  x: number,
  y: number,
  width: number,
  height = width,
): Box {
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
  };
}

export type MapLabel = {
  id: string;
  /** Lower comes first and wins. */
  priority: number;
  /** The whole marker with its label. */
  box: Box;
  /** The marker without its label. Without it, the marker hides when crowded. */
  core?: Box;
  /** The core always shows, so nothing else may cover it. */
  fixed?: boolean;
};

/** "core": show the marker without its label. "none": hide the marker. */
export type Cut = "core" | "none";

/**
 * Which markers to cut back so labels don't run into each other. Fixed
 * cores take their room first. Then each marker, by priority, shows in full
 * if it fits, else its core if that fits, else nothing. Markers not in the
 * result show in full.
 */
export function placeLabels(labels: MapLabel[]): Map<string, Cut> {
  const out = new Map<string, Cut>();
  const fixed = labels.flatMap((label) =>
    label.fixed && label.core ? [{ id: label.id, box: label.core }] : [],
  );
  const taken: Box[] = [];
  const free = (id: string, box: Box) =>
    !taken.some((t) => overlaps(t, box)) &&
    !fixed.some((f) => f.id !== id && overlaps(f.box, box));

  const sorted = [...labels].sort((a, b) => a.priority - b.priority);
  for (const { id, box, core, fixed: isFixed } of sorted) {
    if (free(id, box)) {
      taken.push(box);
    } else if (core && (isFixed || free(id, core))) {
      out.set(id, "core");
      taken.push(core);
    } else {
      out.set(id, "none");
    }
  }
  return out;
}

/** Map zoom, updated after every zoom. Screen distances depend on it. */
export function useZoom(map: MapRef | undefined): number {
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 0);
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    update();
    map.on("zoomend", update);
    return () => void map.off("zoomend", update);
  }, [map]);
  return zoom;
}
