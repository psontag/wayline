import { useQuery } from "@tanstack/react-query";
import type { ReachFile } from "@wayline/domain";
import { useMemo } from "react";
import { useServices } from "../../data/ServicesProvider";
import { type AreaReach, areaReach } from "./areas";
import { type ReachFilter, reachOn } from "./reach";

/**
 * Tourism regions with the train time from home on the first day.
 * Null: the data has no areas or no train times. Undefined: loading.
 */
export function useAreas(
  reach: ReachFile | null | undefined,
  startDate: string,
  filter: ReachFilter,
) {
  const services = useServices();
  const file = useQuery({
    queryKey: ["areas"],
    queryFn: () => services.areas(),
    staleTime: Infinity,
  });
  const areas = useMemo((): AreaReach[] | null | undefined => {
    if (file.data === null || reach === null) return null;
    if (!file.data || !reach) return undefined;
    return areaReach(file.data.areas, reachOn(reach, startDate), filter);
  }, [file.data, reach, startDate, filter]);
  return { areas, attribution: file.data?.attribution ?? "" };
}
