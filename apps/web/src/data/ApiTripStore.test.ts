import { isErrorCode, parseTrip, WaylineError } from "@wayline/domain";
import { describe, expect, it } from "vitest";
import sample from "../../public/data/mock/oberfranken/sample-trip.json";
import { createApiClient } from "./apiClient";
import { ApiTripStore, moveTrips, withMovedTrips } from "./ApiTripStore";
import { LocalTripStore, memoryStorage } from "./LocalTripStore";
import type { TripStore } from "./TripStore";

const trip = parseTrip(sample);

function local(withSample = true) {
  return new LocalTripStore({
    storage: memoryStorage(),
    loadSample: withSample ? async () => sample : undefined,
  });
}

describe("ApiTripStore", () => {
  it("calls the trip endpoints", async () => {
    const calls: string[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      calls.push(`${req.method} ${new URL(req.url).pathname}`);
      if (req.method === "DELETE") return new Response(null, { status: 204 });
      if (req.method === "PUT") return Response.json(await req.json());
      return Response.json(trip);
    };
    const store = new ApiTripStore(
      createApiClient("http://w", fetch),
      () => "new-id",
    );
    expect((await store.get(trip.id)).name).toBe(trip.name);
    expect((await store.save(trip)).id).toBe(trip.id);
    const copy = await store.duplicate(trip.id, "Copy");
    expect(copy).toMatchObject({ id: "new-id", name: "Copy" });
    await store.delete(trip.id);
    expect(calls).toEqual([
      `GET /api/trips/${trip.id}`,
      `PUT /api/trips/${trip.id}`,
      `GET /api/trips/${trip.id}`,
      "PUT /api/trips/new-id",
      `DELETE /api/trips/${trip.id}`,
    ]);
  });

  it("turns API errors into WaylineErrors", async () => {
    const fetch = async () =>
      Response.json({ code: "NOT_FOUND", message: "No trip" }, { status: 404 });
    const store = new ApiTripStore(createApiClient("http://w", fetch));
    const error = await store.get("x").catch((e) => e);
    expect(isErrorCode(error, "NOT_FOUND")).toBe(true);
  });
});

describe("moveTrips", () => {
  it("moves trips to the server and deletes them locally", async () => {
    const from = local();
    const to = local(false);
    await moveTrips(from, to);
    expect(await from.list()).toEqual([]);
    expect((await to.list()).map((t) => t.id)).toEqual([trip.id]);
  });

  it("keeps trips the server refused, except for conflicts", async () => {
    const from = local();
    const refuse = (code: "NOT_FOUND" | "CONFLICT"): TripStore => {
      const store = local(false);
      store.save = async () => {
        throw new WaylineError(code);
      };
      return store;
    };
    await moveTrips(from, refuse("NOT_FOUND"));
    expect(await from.list()).toHaveLength(1);
    await moveTrips(from, refuse("CONFLICT"));
    expect(await from.list()).toHaveLength(0);
  });

  it("moves once, before the first call", async () => {
    const from = local();
    const to = local(false);
    const store = withMovedTrips(to, from);
    expect((await store.list()).map((t) => t.id)).toEqual([trip.id]);
    await store.delete(trip.id);
    expect(await store.list()).toEqual([]);
  });
});
