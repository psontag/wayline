import { readFile } from "node:fs/promises";
import { encodeLine, type Leg, type Manifest } from "@wayline/domain";
import type { RoutingProvider } from "@wayline/providers";
import { COST_PROFILES, Router } from "@wayline/router";

/**
 * Routes on the routing tiles of a dataset folder, like the app's
 * LocalRouting in the browser.
 */
export async function fileRouting(folder: URL): Promise<RoutingProvider> {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", folder), "utf8"),
  ) as Manifest;
  if (!manifest.routing) throw new Error("The dataset has no routing tiles");
  const fetchFile = async (path: string) => {
    try {
      return new Uint8Array(await readFile(new URL(path, folder)));
    } catch {
      return undefined;
    }
  };
  const router = new Router(manifest.routing, fetchFile, COST_PROFILES.touring);
  return {
    async route(points, { profile }) {
      const legs: Leg[] = [];
      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        if (!from || !to) continue;
        const leg = await router.route(from, to);
        if (!leg) throw new Error(`No route from ${from} to ${to}`);
        legs.push({
          from,
          to,
          geometry: encodeLine(leg.points),
          elevation: leg.elevation,
          distance: leg.distance,
          ascent: leg.ascent,
          descent: leg.descent,
          surface: leg.surface,
          provider: "local",
          profileHash: `${profile}-bench`,
        });
      }
      return legs;
    },
  };
}
