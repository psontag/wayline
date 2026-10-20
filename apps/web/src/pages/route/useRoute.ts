import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { LonLat, Profile } from "@wayline/domain";
import { useServices } from "../../data/ServicesProvider";
import { fetchRoute, roundCoord } from "./route";

/**
 * The route through the points. Needs at least two. The old route stays
 * visible while a new one loads.
 */
export function useRoute(points: LonLat[], profile: Profile) {
  const { routing } = useServices();
  const client = useQueryClient();
  return useQuery({
    queryKey: ["route", profile, points.map((p) => roundCoord(p).join(","))],
    enabled: points.length >= 2,
    placeholderData: keepPreviousData,
    queryFn: () => fetchRoute(client, routing, points, profile),
  });
}
