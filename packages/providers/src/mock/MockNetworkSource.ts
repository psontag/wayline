import type { Manifest, Places, RouteNetwork } from "@wayline/domain";
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

  async network(): Promise<RouteNetwork> {
    const manifest = await this.manifest();
    return this.load(manifest.files.network) as Promise<RouteNetwork>;
  }

  async places(): Promise<Places> {
    const manifest = await this.manifest();
    return this.load(manifest.files.places) as Promise<Places>;
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
