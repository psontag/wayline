import type { LonLat } from "@wayline/domain";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import type { ViaPreview, ViaTarget } from "./routeEdits";

/** A via point on its way to a spot: what moves and where it is now. */
export type LiveVia = { target: ViaTarget; at: LonLat };

/** Waits this long after the last move before a preview is routed. */
const PREVIEW_MS = 120;

/**
 * The route through a live via point, routed shortly after each move.
 * Keeps the last result while the point moves, so the line doesn't flicker.
 */
export function useViaPreview(
  live: LiveVia | undefined,
  preview:
    | ((target: ViaTarget, at: LonLat) => Promise<ViaPreview | undefined>)
    | undefined,
): ViaPreview | undefined {
  const [routed, setRouted] = useState<ViaPreview>();
  // The latest preview function, so a new one does not restart the timer.
  const previewFn = useRef(preview);
  useEffect(() => {
    previewFn.current = preview;
  });
  const active = !!live;
  if (!active && routed) setRouted(undefined);
  useEffect(() => {
    if (!live) return;
    let stale = false;
    const timer = setTimeout(() => {
      void previewFn.current?.(live.target, live.at).then((result) => {
        if (!stale) setRouted(result);
      });
    }, PREVIEW_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [live]);
  return active ? routed : undefined;
}

/**
 * Touch placing: a pin stays in the middle of the map and the map moves
 * under it. Start moves the map so the point is in the middle.
 */
export function useViaPlacing(mapRef: RefObject<MapRef | null>) {
  const [placing, setPlacing] = useState<LiveVia>();
  const on = !!placing;
  useEffect(() => {
    const map = mapRef.current;
    if (!on || !map) return;
    const onMove = () => {
      const { lng, lat } = map.getCenter();
      setPlacing((p) => p && { ...p, at: [lng, lat] });
    };
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, [on, mapRef]);

  const start = (target: ViaTarget, at: LonLat) => {
    setPlacing({ target, at });
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.easeTo({ center: at, duration: reduce ? 0 : 300 });
  };
  return { placing, start, stop: () => setPlacing(undefined) };
}
