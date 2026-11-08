/**
 * Long-distance trains and buses. A bike needs a reservation on them: IC,
 * ICE, EC, Railjet, night trains, TGV, Flixtrain and FlixBus.
 */
const RESERVATION = /^(ICE|ICD|IC|ECE|EC|RJX?|NJ|EN|TGV|FLX|FlixBus)\b/i;

/** A line like "ICE 591" needs a bike reservation. */
export function needsReservation(line: string): boolean {
  return RESERVATION.test(line.trim());
}

/** A connection with an IC, ICE or other long-distance leg. */
export function connectionNeedsReservation(c: { lines: string[] }): boolean {
  return c.lines.some(needsReservation);
}

/** Connections with at most one change, if there are any. Else all. */
export function preferFewChanges<T extends { changes: number }>(
  options: T[],
): T[] {
  const few = options.filter((o) => o.changes <= 1);
  return few.length ? few : options;
}
