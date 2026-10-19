export type TripEditorSearch = {
  /** Selected stage index. */
  stage?: number;
};

/** Search params of /trips/$tripId. Owned by the trip editor. */
export function validateTripEditorSearch(
  search: Record<string, unknown>,
): TripEditorSearch {
  const stage = Number(search.stage);
  return Number.isInteger(stage) && stage >= 0 ? { stage } : {};
}
