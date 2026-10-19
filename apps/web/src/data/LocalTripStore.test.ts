import { isErrorCode, parseTrip, tripStats } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import sample from "../../public/data/mock/oberfranken/sample-trip.json";
import { LocalTripStore, memoryStorage } from "./LocalTripStore";

describe("sample-trip.json", () => {
  it("is a valid trip with four stages", () => {
    const trip = parseTrip(sample);
    expect(trip.stages).toHaveLength(4);
    expect(trip.stages.slice(0, 3).every((s) => s.hotel)).toBe(true);
    expect(trip.stages[3]!.hotel).toBeUndefined();
    const stats = tripStats(trip.stages);
    expect(stats.distance).toBeGreaterThan(250_000);
    for (const [i, stage] of trip.stages.entries()) {
      expect(stage.legs[0]!.elevation.length).toBeGreaterThan(10);
      if (i > 0)
        expect(stage.start.coord).toEqual(trip.stages[i - 1]!.end.coord);
    }
  });
});

function store() {
  let t = Date.parse("2027-06-01T10:00:00.000Z");
  let n = 0;
  return new LocalTripStore({
    storage: memoryStorage(),
    loadSample: async () => sample,
    now: () => new Date((t += 1000)),
    newId: () => `copy-${++n}`,
  });
}

describe("LocalTripStore", () => {
  it("seeds the sample trip a week ahead", async () => {
    const trips = store();
    const list = await trips.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.stageCount).toBe(4);
    expect(list[0]!.preview.length).toBeGreaterThan(10);
    const trip = await trips.get(list[0]!.id);
    expect(trip.startDate).toBe("2027-06-08");
  });

  it("saves with a conflict check", async () => {
    const trips = store();
    const trip = await trips.get(sample.id);
    const saved = await trips.save({ ...trip, name: "Renamed" });
    expect(saved.updatedAt > trip.updatedAt).toBe(true);
    expect((await trips.get(trip.id)).name).toBe("Renamed");

    const stale = trips.save({ ...trip, name: "Stale" });
    await expect(stale).rejects.toSatisfy((e) => isErrorCode(e, "CONFLICT"));
  });

  it("duplicates and deletes", async () => {
    const trips = store();
    const copy = await trips.duplicate(sample.id, "Copy");
    expect(copy.id).toBe("copy-1");
    expect(await trips.list()).toHaveLength(2);
    await trips.delete(sample.id);
    const list = await trips.list();
    expect(list.map((t) => t.name)).toEqual(["Copy"]);
    await expect(trips.get(sample.id)).rejects.toSatisfy((e) =>
      isErrorCode(e, "NOT_FOUND"),
    );
  });
});
