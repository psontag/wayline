import type { Area } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import type { AreaReach } from "./areas";
import { tripWindows } from "./tripWindows";
import type { Rain } from "./whereWeather";

function area(id: string, minutes: number, dryDays: number[]): AreaReach {
  const days: Rain[] = Array.from({ length: 16 }, (_, i) =>
    dryDays.includes(i) ? "dry" : "wet",
  );
  return {
    area: { id, name: id } as Area,
    reach: { minutes, changes: 0, reservation: false },
    over: false,
    days,
  };
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("tripWindows", () => {
  it("ranks windows by dry areas, closer ones count more", () => {
    const windows = tripWindows(
      [
        area("near", 30, range(0, 2)),
        area("far", 300, range(5, 7)),
        area("far2", 300, range(5, 7)),
      ],
      3,
    );
    expect(windows.map((w) => w.start)).toEqual([0, 5]);
    expect(windows[0]?.dry.map((a) => a.area.id)).toEqual(["near"]);
  });

  it("keeps windows apart and at most three", () => {
    const windows = tripWindows([area("a", 60, range(0, 15))], 2);
    expect(windows).toHaveLength(3);
    const starts = windows.map((w) => w.start).sort((a, b) => a - b);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(2);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(2);
  });

  it("counts windows past day 10 less", () => {
    const windows = tripWindows(
      [area("a", 60, range(0, 1)), area("b", 60, range(13, 14))],
      2,
    );
    expect(windows[0]?.start).toBe(0);
    expect(windows[1]).toMatchObject({ start: 13, rough: true });
  });

  it("suggests nothing when nothing is dry", () => {
    expect(tripWindows([area("a", 60, [])], 2)).toEqual([]);
  });
});
