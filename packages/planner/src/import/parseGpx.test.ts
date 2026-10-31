import { parseTrip } from "@wayline/domain";
import { readMockFile } from "@wayline/providers/testing";
import { describe, expect, it } from "vitest";
import { tripToGpx } from "../generate/gpx";
import { parseGpx } from "./parseGpx";

describe("parseGpx", () => {
  it("reads points, elevation and the name of our own export", async () => {
    const trip = parseTrip(await readMockFile("sample-trip.json"));
    const gpx = parseGpx(tripToGpx(trip));
    expect(gpx?.name).toBe(trip.name);
    expect(gpx?.points.length).toBeGreaterThan(100);
    expect(gpx?.points[0]?.ele).toBeTypeOf("number");
    expect(gpx?.points[0]?.coord[1]).toBeCloseTo(
      trip.stages[0]?.start.coord[1] ?? 0,
      3,
    );
  });

  it("joins segments, keeps missing elevation and takes any attribute order", () => {
    const gpx = parseGpx(`<?xml version="1.0"?>
      <gpx version="1.1"><trk><name>Tour &amp; more</name>
        <trkseg><trkpt lon='10.1' lat='50.1'><ele>310.5</ele></trkpt></trkseg>
        <trkseg><trkpt lat="50.2" lon="10.2"/><trkpt lat="50.3" lon="10.3"></trkpt></trkseg>
      </trk></gpx>`);
    expect(gpx).toEqual({
      name: "Tour & more",
      points: [
        { coord: [10.1, 50.1], ele: 310.5 },
        { coord: [10.2, 50.2] },
        { coord: [10.3, 50.3] },
      ],
    });
  });

  it("falls back to route points", () => {
    const gpx = parseGpx(
      `<gpx><rte><rtept lat="50" lon="10"/><rtept lat="50.1" lon="10"/></rte></gpx>`,
    );
    expect(gpx?.points).toHaveLength(2);
    expect(gpx?.name).toBeUndefined();
  });

  it("rejects other files", () => {
    expect(parseGpx("hello")).toBeNull();
    expect(parseGpx(`<gpx><trk><trkseg></trkseg></trk></gpx>`)).toBeNull();
  });
});
