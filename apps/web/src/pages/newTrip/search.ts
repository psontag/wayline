import { GenerateRequest, TripKind } from "@wayline/domain";

export type NewTripSearch = {
  kind?: TripKind;
  /** Fills the form, e.g. when coming back from the proposals. */
  request?: GenerateRequest;
};

/** Search params of /new. Owned by the new trip screen. */
export function validateNewTripSearch(
  search: Record<string, unknown>,
): NewTripSearch {
  const kind = TripKind.safeParse(search.kind);
  const request = GenerateRequest.safeParse(search.request);
  return {
    ...(kind.success ? { kind: kind.data } : {}),
    ...(request.success ? { request: request.data } : {}),
  };
}
