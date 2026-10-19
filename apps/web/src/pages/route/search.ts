import { LonLat, Place, Profile } from "@wayline/domain";
import { z } from "zod";

export type RouteSearch = {
  from?: Place;
  to?: Place;
  /** Via points in route order. */
  via?: LonLat[];
  profile?: Profile;
};

/** Search params of /route. Owned by the route screen. */
export function validateRouteSearch(
  search: Record<string, unknown>,
): RouteSearch {
  const from = Place.safeParse(search.from);
  const to = Place.safeParse(search.to);
  const via = z.array(LonLat).safeParse(search.via);
  const profile = Profile.safeParse(search.profile);
  return {
    ...(from.success ? { from: from.data } : {}),
    ...(to.success ? { to: to.data } : {}),
    ...(via.success && via.data.length ? { via: via.data } : {}),
    ...(profile.success ? { profile: profile.data } : {}),
  };
}
