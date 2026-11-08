import { useQuery } from "@tanstack/react-query";
import type { Place } from "@wayline/domain";
import { useMemo } from "react";
import { useHomeStation } from "../../data/homeStation";
import { useServices } from "../../data/ServicesProvider";
import { bestReach, type ReachFilter, reachOn } from "./reach";
import type { ReachStation } from "./ReachLayer";

/**
 * Stations with a train from home on the first day, within the changes and
 * train kinds of the filter. Null: no train times for this home station.
 */
export function useReach(
  places: Place[],
  startDate: string,
  filter: ReachFilter,
) {
  const services = useServices();
  const [home] = useHomeStation();
  const file = useQuery({
    queryKey: ["reach", home],
    queryFn: () => services.reach(home),
    staleTime: Infinity,
  });
  const stations = useMemo((): ReachStation[] | null | undefined => {
    if (!file.data) return file.data;
    const rows = reachOn(file.data, startDate);
    const out: ReachStation[] = [];
    for (const place of places) {
      const row = place.kind === "station" && place.osmId && rows[place.osmId];
      const reach = row && bestReach(row, filter);
      if (!reach) continue;
      out.push({ place, reach, over: reach.minutes > filter.maxHours * 60 });
    }
    return out;
  }, [file.data, places, startDate, filter]);
  return { home, attribution: file.data?.attribution ?? "", stations };
}
