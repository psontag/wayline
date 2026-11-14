import { useQuery } from "@tanstack/react-query";
import type { Place } from "@wayline/domain";
import { useHomeStation } from "../../data/homeStation";
import { useServices } from "../../data/ServicesProvider";
import { bestReach, defaultReachFilter, reachOn } from "../newTrip/reach";

/** Minutes by train from home to a station on a date. Undefined: unknown. */
export function useTrainTime(date: string | undefined) {
  const services = useServices();
  const [home] = useHomeStation();
  const file = useQuery({
    queryKey: ["reach", home],
    queryFn: () => services.reach(home),
    staleTime: Infinity,
  });
  return (place: Place): number | undefined => {
    if (!file.data || !date || !place.osmId) return undefined;
    const row = reachOn(file.data, date)[place.osmId];
    return row && bestReach(row, defaultReachFilter)?.minutes;
  };
}
