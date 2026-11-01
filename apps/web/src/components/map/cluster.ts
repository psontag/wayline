import type { LonLat } from "@wayline/domain";

export type Cluster<T> = {
  /** Middle of the items. */
  coord: LonLat;
  items: T[];
};

/**
 * Groups items whose screen points are closer than radius pixels. Each
 * group starts at its first item and takes all free items near it.
 */
export function clusterPoints<T extends { coord: LonLat }>(
  items: T[],
  project: (coord: LonLat) => { x: number; y: number },
  radius: number,
): Cluster<T>[] {
  let free = items.map((item) => ({ item, at: project(item.coord) }));
  const clusters: Cluster<T>[] = [];
  for (let seed = free[0]; seed; seed = free[0]) {
    const { x, y } = seed.at;
    const near = free.filter(
      ({ at }) => Math.hypot(at.x - x, at.y - y) < radius,
    );
    free = free.filter((f) => !near.includes(f));
    const members = near.map((n) => n.item);
    const lon = members.reduce((s, m) => s + m.coord[0], 0) / members.length;
    const lat = members.reduce((s, m) => s + m.coord[1], 0) / members.length;
    clusters.push({ coord: [lon, lat], items: members });
  }
  return clusters;
}
