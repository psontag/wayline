import {
  isErrorCode,
  parseTrip,
  Shares,
  type Trip,
  type TripSummary,
} from "@wayline/domain";
import { type ApiClient, createApiClient, readJson } from "./apiClient";
import type { TripStore } from "./TripStore";

/** Trips in D1 through the Worker API. */
export class ApiTripStore implements TripStore {
  constructor(
    private client: ApiClient = createApiClient(),
    private newId: () => string = () => crypto.randomUUID(),
  ) {}

  async list() {
    return (await readJson(
      await this.client.api.trips.$get(),
    )) as TripSummary[];
  }

  async get(id: string) {
    const res = await this.client.api.trips[":id"].$get({ param: { id } });
    return parseTrip(await readJson(res));
  }

  async save(trip: Trip) {
    const res = await this.client.api.trips[":id"].$put({
      param: { id: trip.id },
      json: trip,
    });
    return parseTrip(await readJson(res));
  }

  async delete(id: string) {
    await readJson(
      await this.client.api.trips[":id"].$delete({ param: { id } }),
    );
  }

  async duplicate(id: string, name: string) {
    const trip = await this.get(id);
    const now = new Date().toISOString();
    return this.save({
      ...trip,
      id: this.newId(),
      name,
      createdAt: now,
      updatedAt: now,
      sharedWith: [],
    });
  }

  async shares(id: string) {
    const res = await this.client.api.trips[":id"].shares.$get({
      param: { id },
    });
    return Shares.parse(await readJson(res)).emails;
  }

  async setShares(id: string, emails: string[]) {
    const res = await this.client.api.trips[":id"].shares.$put({
      param: { id },
      json: { emails },
    });
    return Shares.parse(await readJson(res)).emails;
  }
}

/** Email of the logged-in user. */
export async function fetchMe(client: ApiClient = createApiClient()) {
  const { email } = (await readJson(await client.api.me.$get())) as {
    email: string;
  };
  return email;
}

/**
 * Moves trips from browser storage to the server. Each trip is deleted
 * locally once the server has it. Failed trips stay for the next try.
 */
export async function moveTrips(from: TripStore, to: TripStore) {
  for (const { id } of await from.list()) {
    try {
      await to.save(await from.get(id));
    } catch (error) {
      // CONFLICT: the server already has this trip from an earlier move.
      if (!isErrorCode(error, "CONFLICT")) {
        console.warn(`Could not move trip ${id}`, error);
        continue;
      }
    }
    await from.delete(id);
  }
}

/** A store that first moves the browser's trips to the server, once. */
export function withMovedTrips(server: TripStore, local: TripStore): TripStore {
  let moved: Promise<void> | undefined;
  const after = async <T>(call: () => Promise<T>) => {
    moved ??= moveTrips(local, server).catch((error) =>
      console.warn("Could not move local trips", error),
    );
    await moved;
    return call();
  };
  return {
    list: () => after(() => server.list()),
    get: (id) => after(() => server.get(id)),
    save: (trip) => after(() => server.save(trip)),
    delete: (id) => after(() => server.delete(id)),
    duplicate: (id, name) => after(() => server.duplicate(id, name)),
    shares: (id) => after(() => server.shares(id)),
    setShares: (id, emails) => after(() => server.setShares(id, emails)),
  };
}
