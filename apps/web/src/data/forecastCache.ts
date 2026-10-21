import type { CachedForecast, ForecastCache } from "@wayline/providers";

const DB = "wayline-weather";
const STORE = "forecasts";
/** Older entries are removed when the cache opens. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function open(): Promise<IDBDatabase> {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  return request(r);
}

async function prune(db: IDBDatabase) {
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  const keys = await request(store.getAllKeys());
  const values = await request(store.getAll());
  const cutoff = Date.now() - MAX_AGE_MS;
  keys.forEach((key, i) => {
    const value = values[i] as CachedForecast | undefined;
    if (!value || value.fetchedAt < cutoff) store.delete(key);
  });
}

/**
 * Forecasts in IndexedDB, so reopening a trip makes no new calls.
 * Without IndexedDB, e.g. in a private window, nothing is cached.
 */
export function indexedDbForecastCache(): ForecastCache {
  const db = open().then(async (d) => {
    await prune(d).catch(() => undefined);
    return d;
  });
  return {
    async get(key) {
      const store = (await db).transaction(STORE).objectStore(STORE);
      return (await request(store.get(key))) as CachedForecast | undefined;
    },
    async set(key, value) {
      const store = (await db)
        .transaction(STORE, "readwrite")
        .objectStore(STORE);
      await request(store.put(value, key));
    },
  };
}
