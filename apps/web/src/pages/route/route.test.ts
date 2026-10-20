import { QueryClient } from "@tanstack/react-query";
import {
  encodeLine,
  type Leg,
  type LonLat,
  type Place,
  Trip,
} from "@wayline/domain";
import type { RoutingProvider } from "@wayline/providers";
import { describe, expect, it, vi } from "vitest";
import {
  fetchRoute,
  insertVia,
  mapPlace,
  moveVia,
  removeVia,
  routeToTrip,
  viaDistances,
} from "./route";

function straight(from: LonLat, to: LonLat): Leg {
  return {
    from,
    to,
    geometry: encodeLine([from, to]),
    elevation: [300, 320],
    distance: 1000,
    ascent: 20,
    descent: 0,
    surface: { paved: 1, gravel: 0, unpaved: 0 },
    provider: "test",
    profileHash: "touring",
  };
}

function fakeRouting() {
  const route = vi.fn<RoutingProvider["route"]>(async (points) =>
    points.slice(1).map((to, i) => straight(points[i] as LonLat, to)),
  );
  return { route };
}

const a: LonLat = [10.9, 49.9];
const b: LonLat = [11.0, 50.0];

describe("fetchRoute", () => {
  it("returns one leg per pair of points", async () => {
    const routing = fakeRouting();
    const legs = await fetchRoute(new QueryClient(), routing, [a, b], "fast");
    expect(legs).toHaveLength(1);
    expect(routing.route).toHaveBeenCalledWith([a, b], expect.anything());
  });

  it("routes a leg only once", async () => {
    const client = new QueryClient();
    const routing = fakeRouting();
    await fetchRoute(client, routing, [a, b], "touring");
    await fetchRoute(client, routing, [a, b], "touring");
    expect(routing.route).toHaveBeenCalledTimes(1);
  });

  it("routes only the legs a via point changes", async () => {
    const client = new QueryClient();
    const routing = fakeRouting();
    const c: LonLat = [11.1, 50.1];
    const v: LonLat = [10.95, 49.95];
    await fetchRoute(client, routing, [a, b, c], "touring");
    expect(routing.route).toHaveBeenCalledTimes(2);

    // A via point on the first leg splits it. The second leg is kept.
    await fetchRoute(client, routing, [a, v, b, c], "touring");
    expect(routing.route).toHaveBeenCalledTimes(4);
    expect(routing.route).toHaveBeenNthCalledWith(3, [a, v], expect.anything());
    expect(routing.route).toHaveBeenNthCalledWith(4, [v, b], expect.anything());

    // Removing it again needs no routing at all.
    await fetchRoute(client, routing, [a, b, c], "touring");
    expect(routing.route).toHaveBeenCalledTimes(4);
  });

  it("routes again for another profile", async () => {
    const client = new QueryClient();
    const routing = fakeRouting();
    await fetchRoute(client, routing, [a, b], "touring");
    await fetchRoute(client, routing, [a, b], "quiet");
    expect(routing.route).toHaveBeenCalledTimes(2);
  });
});

describe("mapPlace", () => {
  const bamberg: Place = {
    name: "Bamberg",
    kind: "town",
    coord: [10.89, 49.89],
  };

  it("takes the name of a place nearby", () => {
    const place = mapPlace([10.901234567, 49.9], [bamberg]);
    expect(place).toEqual({
      name: "Bamberg",
      kind: "custom",
      coord: [10.90123, 49.9],
    });
  });

  it("uses the coordinates far from any place", () => {
    expect(mapPlace([12, 51], [bamberg]).name).toBe("51.0000, 12.0000");
  });
});

describe("routeToTrip", () => {
  it("makes a valid trip with one stage", () => {
    const trip = routeToTrip({
      name: "A → B",
      from: { name: "A", kind: "town", coord: a },
      to: { name: "B", kind: "station", coord: b },
      legs: [straight(a, b)],
      profile: "scenic",
      now: new Date("2026-06-01T10:00:00Z"),
      newId: () => "id",
    });
    expect(Trip.parse(trip)).toEqual(trip);
    expect(trip.kind).toBe("route");
    expect(trip.stages).toHaveLength(1);
    expect(trip.stages[0]?.stats.distance).toBe(1000);
    expect(trip.stages[0]?.end.locked).toBe(true);
  });
});

describe("via points", () => {
  const v1: LonLat = [1, 1];
  const v2: LonLat = [2, 2];

  it("inserts on a leg", () => {
    expect(insertVia([], 0, v1)).toEqual([v1]);
    expect(insertVia([v1], 0, v2)).toEqual([v2, v1]);
    expect(insertVia([v1], 1, v2)).toEqual([v1, v2]);
  });

  it("rounds new points to 5 decimals", () => {
    expect(insertVia([], 0, [1.123456789, 2.987654321])).toEqual([
      [1.12346, 2.98765],
    ]);
  });

  it("moves and removes", () => {
    expect(moveVia([v1, v2], 1, [3, 3])).toEqual([v1, [3, 3]]);
    expect(removeVia([v1, v2], 0)).toEqual([v2]);
  });

  it("measures the distance to each via point", () => {
    const leg = straight(a, b);
    expect(viaDistances([leg, leg, leg])).toEqual([1000, 2000]);
    expect(viaDistances([leg])).toEqual([]);
  });
});
