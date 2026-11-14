import { GenerateRequest, TripKind } from "@wayline/domain";

export const newTripSteps = ["where", "area", "trip"] as const;
export type NewTripStep = (typeof newTripSteps)[number];

export type NewTripSearch = {
  kind?: TripKind;
  /** Fills the form, e.g. when coming back from the proposals. */
  request?: GenerateRequest;
  /** Default: Trip with a request, else Where. A request for a signed route opens Where. */
  step?: NewTripStep;
  /** Id of the area on the Area step. */
  area?: string;
};

/** Search params of /new. Owned by the new trip screen. */
export function validateNewTripSearch(
  search: Record<string, unknown>,
): NewTripSearch {
  const kind = TripKind.safeParse(search.kind);
  const request = GenerateRequest.safeParse(search.request);
  const step = newTripSteps.find((s) => s === search.step);
  const area = typeof search.area === "string" ? search.area : undefined;
  return {
    ...(kind.success ? { kind: kind.data } : {}),
    ...(request.success ? { request: request.data } : {}),
    ...(step ? { step } : {}),
    ...(area && step === "area" ? { area } : {}),
  };
}
