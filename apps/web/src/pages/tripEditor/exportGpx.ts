import { routePoints, type Trip } from "@wayline/domain";

const escape = (text: string) =>
  text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Downloads the trip as a GPX file with one track per stage. */
export function exportGpx(trip: Trip) {
  const tracks = trip.stages.map((stage, i) => {
    const points = routePoints(stage.legs)
      .map(
        (p) =>
          `<trkpt lat="${p.coord[1]}" lon="${p.coord[0]}"><ele>${Math.round(p.ele)}</ele></trkpt>`,
      )
      .join("");
    const name = `${i + 1}. ${stage.start.name} – ${stage.end.name}`;
    return `<trk><name>${escape(name)}</name><trkseg>${points}</trkseg></trk>`;
  });
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Wayline" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${escape(trip.name)}</name></metadata>
${tracks.join("\n")}
</gpx>
`;
  const url = URL.createObjectURL(
    new Blob([gpx], { type: "application/gpx+xml" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${trip.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.gpx`;
  link.click();
  URL.revokeObjectURL(url);
}
