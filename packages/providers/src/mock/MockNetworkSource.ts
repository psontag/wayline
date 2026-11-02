import type {
  Manifest,
  Places,
  RouteNetwork,
  SearchIndex,
} from "@wayline/domain";
import { searchIndex } from "../TiledNetworkSource";
import type { FetchJson, RouteNetworkSource } from "../types";

/** Geodata from the mock JSON files, e.g. /data/mock/oberfranken/. */
export class MockNetworkSource implements RouteNetworkSource {
  private cache = new Map<string, Promise<unknown>>();

  constructor(
    private fetchJson: FetchJson,
    private baseUrl = "/data/mock/oberfranken",
  ) {}

  manifest(): Promise<Manifest> {
    return this.load("manifest.json") as Promise<Manifest>;
  }

  /** The whole network. It is small, so a bbox is ignored. */
  async network(): Promise<RouteNetwork> {
    const { files } = await this.manifest();
    if (!files.network) throw new Error(`${this.baseUrl} has no network file`);
    return this.load(files.network) as Promise<RouteNetwork>;
  }

  /** All places. They are few, so a bbox is ignored. */
  async places(): Promise<Places> {
    const { files } = await this.manifest();
    if (!files.places) throw new Error(`${this.baseUrl} has no places file`);
    return this.load(files.places) as Promise<Places>;
  }

  async search(): Promise<SearchIndex> {
    return searchIndex(await this.places());
  }

  private load(file: string): Promise<unknown> {
    let p = this.cache.get(file);
    if (!p) {
      p = this.fetchJson(`${this.baseUrl}/${file}`);
      // A failed load is retried on the next call.
      p.catch(() => this.cache.delete(file));
      this.cache.set(file, p);
    }
    return p;
  }
}
