import { useQuery } from "@tanstack/react-query";
import {
  dayShares,
  type LonLat,
  type Place,
  type ReachFile,
} from "@wayline/domain";
import { useMemo } from "react";
import { useServices } from "../../data/ServicesProvider";
import { formDays, type NewTripValues } from "./form";
import type { ReachFilter } from "./reach";
import { type ShelfRoute, shelfRoutes } from "./routeShelf";

/** Km of the trip in the form: km per day times the days, short days in part. */
export function tripKm(values: NewTripValues): number | undefined {
  const days = formDays(values);
  if (!values.kmPerDay || !(days >= 1 && days <= 14)) return undefined;
  const shares =
    days === 1 ? [1] : dayShares(days, values.startTime, values.backBy);
  return shares.reduce((a, b) => a + b, 0) * values.kmPerDay;
}

/**
 * Signed routes with stations in reach, and the best stretch for the trip.
 * Null: the data has no route stations or no train times.
 */
export function useRouteShelf(
  places: Place[],
  reach: ReachFile | null | undefined,
  filter: ReachFilter,
  values: NewTripValues,
  /** Wind effort of riding a line. Breaks near ties in train time. */
  wind?: (line: LonLat[]) => number,
): ShelfRoute[] | null | undefined {
  const services = useServices();
  const file = useQuery({
    queryKey: ["routeStations"],
    queryFn: () => services.routeStations(),
    staleTime: Infinity,
  });
  const stations = useMemo(() => {
    const out = new Map<string, Place>();
    for (const p of places) {
      if (p.kind === "station" && p.osmId) out.set(p.osmId, p);
    }
    return out;
  }, [places]);
  const km = tripKm(values);
  const days = formDays(values);
  const { startDate } = values;
  return useMemo(() => {
    if (file.data === null || reach === null) return null;
    if (!file.data || !reach || !km) return undefined;
    return shelfRoutes({
      file: file.data,
      reach,
      stations,
      filter,
      startDate,
      days,
      km,
      ...(wind && { wind }),
    });
  }, [file.data, reach, stations, filter, startDate, days, km, wind]);
}
