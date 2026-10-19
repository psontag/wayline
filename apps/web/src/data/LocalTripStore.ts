import {
  addDays,
  parseTrip,
  summarizeTrip,
  type Trip,
  WaylineError,
} from "@wayline/domain";
import { createStore, del, get, keys, set } from "idb-keyval";
import type { TripStore } from "./TripStore";

/** Minimal key-value storage. IndexedDB in the app, a Map in tests. */
export type KeyValue = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
};

const SEEDED = "meta:seeded";
const TRIP = "trip:";

/**
 * Trips in browser storage. Seeds the sample trip on first run.
 * Falls back to memory when IndexedDB is not available.
 */
export class LocalTripStore implements TripStore {
  private ready?: Promise<KeyValue>;

  constructor(
    private options: {
      storage?: KeyValue;
      /** Sample trip JSON for the first run. */
      loadSample?: () => Promise<unknown>;
      now?: () => Date;
      newId?: () => string;
    } = {},
  ) {}

  async list() {
    const kv = await this.kv();
    const ids = (await kv.keys()).filter((k) => k.startsWith(TRIP));
    const trips = await Promise.all(ids.map((k) => kv.get(k)));
    return trips
      .map((t) => summarizeTrip(parseTrip(t)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string) {
    const data = await (await this.kv()).get(TRIP + id);
    if (!data) throw new WaylineError("NOT_FOUND", `No trip ${id}`);
    return parseTrip(data);
  }

  async save(trip: Trip) {
    const kv = await this.kv();
    const stored = await kv.get(TRIP + trip.id);
    if (stored && parseTrip(stored).updatedAt !== trip.updatedAt) {
      throw new WaylineError("CONFLICT", "Trip changed since it was loaded");
    }
    const saved = parseTrip({
      ...trip,
      updatedAt: this.timestamp(trip.updatedAt),
    });
    await kv.set(TRIP + saved.id, saved);
    return saved;
  }

  async delete(id: string) {
    await (await this.kv()).del(TRIP + id);
  }

  async duplicate(id: string, name: string) {
    const trip = await this.get(id);
    const now = this.now().toISOString();
    const copy: Trip = {
      ...trip,
      id: this.options.newId?.() ?? crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      sharedWith: [],
    };
    await (await this.kv()).set(TRIP + copy.id, copy);
    return copy;
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }

  /** Always later than the previous value, even within one millisecond. */
  private timestamp(previous: string) {
    const now = this.now().getTime();
    const prev = Date.parse(previous);
    return new Date(Math.max(now, prev + 1)).toISOString();
  }

  private kv() {
    this.ready ??= this.open();
    return this.ready;
  }

  private async open(): Promise<KeyValue> {
    const kv = this.options.storage ?? (await indexedDbOrMemory());
    try {
      if (!(await kv.get(SEEDED)) && this.options.loadSample) {
        const sample = parseTrip(await this.options.loadSample());
        // Start a week from now, so the weather forecast covers it.
        const today = this.now().toISOString().slice(0, 10);
        await kv.set(TRIP + sample.id, {
          ...sample,
          startDate: addDays(today, 7),
        });
      }
      await kv.set(SEEDED, true);
    } catch (error) {
      console.warn("Could not seed the sample trip", error);
    }
    return kv;
  }
}

async function indexedDbOrMemory(): Promise<KeyValue> {
  try {
    const store = createStore("wayline", "trips");
    await keys(store);
    return {
      get: (k) => get(k, store),
      set: (k, v) => set(k, v, store),
      del: (k) => del(k, store),
      keys: async () => (await keys(store)).map(String),
    };
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage(): KeyValue {
  const map = new Map<string, unknown>();
  return {
    get: async (k) => map.get(k),
    set: async (k, v) => void map.set(k, v),
    del: async (k) => void map.delete(k),
    keys: async () => [...map.keys()],
  };
}
