import type { LonLat } from "@wayline/domain";
import { useEffect, useRef, useState } from "react";
import type {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "react-map-gl/maplibre";
import type { MapEvents } from "../../components/map/AppMap";

/** Hold this long without moving to open the menu. */
const HOLD_MS = 500;
/** A finger that moves further is panning, not holding. */
const HOLD_PX = 8;

export type SpotAnchor =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type Spot = {
  at: LonLat;
  /** Opens the menu towards the middle of the map, so it stays in view. */
  anchor: SpotAnchor;
};

function spotOf(e: MapLayerMouseEvent | MapLayerTouchEvent): Spot {
  const { clientWidth, clientHeight } = e.target.getContainer();
  const v = e.point.y > clientHeight / 2 ? "bottom" : "top";
  const h = e.point.x > clientWidth / 2 ? "right" : "left";
  return { at: [e.lngLat.lng, e.lngLat.lat], anchor: `${v}-${h}` };
}

/**
 * A menu for a spot on the map: right-click with a mouse, long-press with
 * a finger. Closes when the map moves or on Esc. Pass `events` to AppMap.
 */
export function usePointMenu(enabled: boolean) {
  const [spot, setSpot] = useState<Spot>();
  const hold = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  }>(undefined);

  const cancel = () => {
    clearTimeout(hold.current?.timer);
    hold.current = undefined;
  };
  useEffect(() => cancel, []);

  const events: MapEvents = enabled
    ? {
        onContextMenu: (e: MapLayerMouseEvent) => {
          e.preventDefault();
          setSpot(spotOf(e));
        },
        onTouchStart: (e: MapLayerTouchEvent) => {
          cancel();
          if (e.originalEvent.touches.length !== 1) return;
          const next = spotOf(e);
          hold.current = {
            timer: setTimeout(() => setSpot(next), HOLD_MS),
            ...e.point,
          };
        },
        onTouchMove: (e: MapLayerTouchEvent) => {
          const start = hold.current;
          if (!start) return;
          const moved = Math.hypot(e.point.x - start.x, e.point.y - start.y);
          if (moved > HOLD_PX || e.originalEvent.touches.length !== 1) cancel();
        },
        onTouchEnd: cancel,
        onTouchCancel: cancel,
        onMoveStart: () => {
          cancel();
          setSpot(undefined);
        },
      }
    : {};

  const open = enabled && !!spot;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpot(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return {
    spot: enabled ? spot : undefined,
    events,
    close: () => setSpot(undefined),
  };
}
