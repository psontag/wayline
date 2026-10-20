import { Place, Profile } from "@wayline/domain";

export type RouteSearch = {
  from?: Place;
  to?: Place;
  profile?: Profile;
};

/** Search params of /route. Owned by the route screen. */
export function validateRouteSearch(
  search: Record<string, unknown>,
): RouteSearch {
  const from = Place.safeParse(search.from);
  const to = Place.safeParse(search.to);
  const profile = Profile.safeParse(search.profile);
  return {
    ...(from.success ? { from: from.data } : {}),
    ...(to.success ? { to: to.data } : {}),
    ...(profile.success ? { profile: profile.data } : {}),
  };
}
