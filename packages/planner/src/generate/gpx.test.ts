import { parseTrip } from "@wayline/domain";
import { readMockFile } from "@wayline/providers/testing";
import { describe, expect, it } from "vitest";
import { gpxFileName, tripToGpx } from "./gpx";

describe("tripToGpx", () => {
  it("writes waypoints and one segment per stage", async () => {
    const trip = parseTrip(await readMockFile("sample-trip.json"));
    const gpx = tripToGpx(trip);
    expect(gpx).toMatch(/^<\?xml/);
    expect(gpx.match(/<wpt /g)).toHaveLength(trip.stages.length + 1);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(trip.stages.length);
    expect(gpx).toContain("<name>Bamberg</name>");
    expect(gpx).toMatch(
      /<trkpt lat="49\.\d+" lon="10\.\d+"><ele>\d+<\/ele><\/trkpt>/,
    );
  });

  it("escapes names", async () => {
    const trip = parseTrip(await readMockFile("sample-trip.json"));
    const gpx = tripToGpx({ ...trip, name: 'A & B <"x">' });
    expect(gpx).toContain("A &amp; B &lt;&quot;x&quot;&gt;");
  });
});

describe("gpxFileName", () => {
  it("makes a plain file name", async () => {
    const trip = parseTrip(await readMockFile("sample-trip.json"));
    expect(gpxFileName(trip)).toBe("bamberg-bad-rodach-b-coburg.gpx");
    expect(gpxFileName({ ...trip, name: "Weißenstadt – Kötzting" })).toBe(
      "weissenstadt-kotzting.gpx",
    );
  });
});
