import type { Trip } from "@wayline/domain";
import { gpxFileName, tripToGpx } from "@wayline/planner";

/** Saves the trip as a GPX file in the browser. */
export function downloadTripGpx(trip: Trip): void {
  const blob = new Blob([tripToGpx(trip)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = gpxFileName(trip);
  a.click();
  URL.revokeObjectURL(url);
}
