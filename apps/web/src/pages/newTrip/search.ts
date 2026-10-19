import { TripKind } from "@wayline/domain";

export type NewTripSearch = { kind?: TripKind };

/** Search params of /new. Owned by the new trip screen. */
export function validateNewTripSearch(
  search: Record<string, unknown>,
): NewTripSearch {
  const kind = TripKind.safeParse(search.kind);
  return kind.success ? { kind: kind.data } : {};
}
