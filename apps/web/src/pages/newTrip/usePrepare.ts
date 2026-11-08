import { useEffect } from "react";
import { useServices } from "../../data/ServicesProvider";
import { missingPlaces, type NewTripValues, toRequest } from "./form";

/** Wait this long after the last change, so typing doesn't load every area. */
const DELAY_MS = 600;

/** Loads the network for the trip in the form, while the user fills it in. */
export function usePrepare(values: NewTripValues) {
  const { generator } = useServices();
  const request = missingPlaces(values) ? undefined : tryRequest(values);
  // Only what decides the area: places and length.
  const key = request
    ? JSON.stringify([
        request.startStation?.coord,
        request.endStation?.coord,
        request.days,
        request.kmPerDay,
        request.dayShares,
      ])
    : undefined;
  useEffect(() => {
    if (!key || !request) return;
    const timer = setTimeout(() => generator.prepare(request), DELAY_MS);
    return () => clearTimeout(timer);
    // The key covers what matters of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generator, key]);
}

function tryRequest(values: NewTripValues) {
  try {
    return toRequest(values);
  } catch {
    return undefined;
  }
}
