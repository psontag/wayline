import type { LonLat } from "@wayline/domain";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";

export type RouteDrag = {
  /** Leg that gets the new via point. */
  leg: number;
  at: LonLat;
};

type Point = { x: number; y: number };

// Below this many pixels a press on the line is a click, not a drag.
const DRAG_PX = 4;

/** Closest point on the line to a screen point, in screen space. */
export function nearestOnLine(
  map: MapRef,
  line: LonLat[],
  p: Point,
): LonLat {
  let best: Point | undefined;
  let bestD = Infinity;
  const points = line.map((c) => map.project(c));
  for (const [i, b] of points.entries()) {
    const a = points[i - 1] ?? b;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
      : 0;
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  const at = map.unproject(best ? [best.x, best.y] : [p.x, p.y]);
  return [at.lng, at.lat];
}

/** The leg under the pointer. Not when the pointer is on a marker. */
function legOf(event: MapLayerMouseEvent, map: MapRef): number | undefined {
  if (event.originalEvent.target !== map.getCanvas()) return;
  const leg: unknown = event.features?.[0]?.properties?.leg;
  return typeof leg === "number" ? leg : undefined;
}

/**
 * Drag the route line to add a via point. Hovering the line shows where
 * the point would go. Nothing is routed until the drop.
 */
export function useRouteDrag({
  mapRef,
  lines,
  enabled,
  onDrop,
}: {
  mapRef: RefObject<MapRef | null>;
  /** Coordinates per leg. */
  lines: LonLat[][];
  enabled: boolean;
  onDrop: (leg: number, at: LonLat) => void;
}) {
  const [ghost, setGhost] = useState<LonLat>();
  const [drag, setDrag] = useState<RouteDrag>();
  const stop = useRef<() => void>(undefined);
  useEffect(() => () => stop.current?.(), []);

  const onMouseMove = (event: MapLayerMouseEvent) => {
    const map = mapRef.current;
    const leg = map ? legOf(event, map) : undefined;
    const line = leg === undefined ? undefined : lines[leg];
    setGhost(
      enabled && !drag && map && line
        ? nearestOnLine(map, line, event.point)
        : undefined,
    );
  };

  const onMouseDown = (event: MapLayerMouseEvent) => {
    const map = mapRef.current;
    const leg = map ? legOf(event, map) : undefined;
    if (!enabled || !map || leg === undefined) return;
    // Keeps the map from panning.
    event.preventDefault();
    const start = event.point;
    let at: LonLat = [event.lngLat.lng, event.lngLat.lat];
    let moved = false;
    setGhost(undefined);

    const move = (e: MouseEvent) => {
      const rect = map.getCanvas().getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      moved ||= Math.hypot(p.x - start.x, p.y - start.y) > DRAG_PX;
      if (!moved) return;
      const ll = map.unproject([p.x, p.y]);
      at = [ll.lng, ll.lat];
      setDrag({ leg, at });
    };
    const up = () => {
      stop.current?.();
      setDrag(undefined);
      if (moved) onDrop(leg, at);
    };
    stop.current = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      stop.current = undefined;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return {
    ghost: enabled ? ghost : undefined,
    drag,
    onMouseMove,
    onMouseDown,
    onMouseLeave: () => setGhost(undefined),
  };
}
