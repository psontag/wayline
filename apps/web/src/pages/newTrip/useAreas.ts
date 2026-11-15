import { useQuery } from "@tanstack/react-query";
import type { ReachFile } from "@wayline/domain";
import { useMemo } from "react";
import { useServices } from "../../data/ServicesProvider";
import type { MultiPolygon } from "geojson";
import { type AreaReach, areaReach, areaShape } from "./areas";
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
  const file = useAreasFile();
  const areas = useMemo((): AreaReach[] | null | undefined => {
    if (file.data === null || reach === null) return null;
    if (!file.data || !reach) return undefined;
    return areaReach(file.data.areas, reachOn(reach, startDate), filter);
  }, [file.data, reach, startDate, filter]);
  return { areas, attribution: file.data?.attribution ?? "" };
}

function useAreasFile() {
  const services = useServices();
  return useQuery({
    queryKey: ["areas"],
    queryFn: () => services.areas(),
    staleTime: Infinity,
  });
}

/** The outline of one area, once loaded. */
export function useAreaShape(id: string | undefined): MultiPolygon | undefined {
  const file = useAreasFile();
  return useMemo(() => {
    const area = id && file.data?.areas.find((a) => a.id === id);
    return area ? areaShape(area) : undefined;
  }, [id, file.data]);
}
