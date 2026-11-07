// Spike #81: routes test legs on the two-layer graph and compares them with
// routes on all streets and with BRouter "touring".
//
//   node spike/routing/route.mjs spike/routing/out [rough|touring|brouter] [brouter url]
//
// Needs a local BRouter (pnpm brouter) and the output of build.py.
import { readFileSync, writeFileSync } from "node:fs";

const [dir, model = "touring", brouterUrl = "http://localhost:17777"] =
  process.argv.slice(2);
const LEGS_PER_BUCKET = 50;
const BUCKETS = [
  [3, 10],
  [10, 25],
  [25, 60],
];
const STREET_RADIUS_M = 2000;
const NEAR_M = 30;
const MIN_FACTOR = model === "rough" ? 0.8 : 1;

const read = (name) => {
  const b = readFileSync(`${dir}/${name}.bin`);
  return new Int32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
const nodes = read("nodes");
const edges = read("edges");
const shape = read("shape");
const ways = read("ways");
const descent = read("descent");
const places = JSON.parse(readFileSync(`${dir}/places.json`, "utf8"));
const tiles = JSON.parse(readFileSync(`${dir}/tiles.json`, "utf8"));
const n = nodes.length / 2;
const m = edges.length / 7;
const E = { from: 0, to: 1, len: 2, fwd: 3, bwd: 4, level: 5, shape: 6 };
const ALL = 4;

// Cost per meter. "rough" is the factor from build.py, "touring" ports the way
// costs of our BRouter touring profile, "brouter" adds its downhill and turn costs.
const highway = (e) => tiles.highways[ways[e] & 31];
function touringFactor(e) {
  const w = ways[e];
  const hw = highway(e);
  const grade = (w >> 5) & 7;
  const paved = (w >> 8) & 1;
  const unpaved = (w >> 9) & 1;
  const bike = (w >> 10) & 1;
  const signed = (w >> 11) & 1;
  if (signed) return 1;
  const probablyGood = paved && (bike || hw === "footway") && !unpaved;
  let f;
  if (hw === "pedestrian") f = bike ? 2.2 : 3;
  else if (hw === "bridleway") f = 5;
  else if (hw === "cycleway") f = 1;
  else if (hw === "residential" || hw === "living_street")
    f = unpaved ? 1.5 : 1.1;
  else if (hw === "service") f = unpaved ? 1.6 : 1.3;
  else if (["track", "road", "path", "footway"].includes(hw))
    f = [
      probablyGood ? 1 : 5,
      probablyGood ? 1 : 1.3,
      probablyGood ? 1.1 : 2,
      probablyGood ? 1.5 : 3,
      probablyGood ? 2 : 5,
      probablyGood ? 3 : 5,
    ][grade];
  else {
    const unsafe = bike ? 0 : 2;
    const table = {
      trunk: [1.5, 10],
      trunk_link: [1.5, 10],
      primary: [1.2, 3],
      primary_link: [1.2, 3],
      secondary: [1.1, 1.6],
      secondary_link: [1.1, 1.6],
      tertiary: [1, 1.4],
      tertiary_link: [1, 1.4],
      unclassified: [1, 1.3],
    };
    f = unsafe + (table[hw] ? table[hw][bike ? 0 : 1] : 2);
  }
  return f + 0.05;
}
const DOWNHILL_COST = 60;
const TURN_COST = 90;
function costOf(e, base, dir) {
  if (model === "rough" || base < 0) return base;
  const way = edges[e * 7 + E.len] * touringFactor(e);
  const down = model === "brouter" ? DOWNHILL_COST * descent[e * 2 + dir] : 0;
  return Math.max(1, Math.round(way + down));
}

// Adjacency: each usable direction of an edge, with its cost.
const start = new Int32Array(n + 1);
for (let e = 0; e < m; e++) {
  if (edges[e * 7 + E.fwd] >= 0) start[edges[e * 7 + E.from] + 1]++;
  if (edges[e * 7 + E.bwd] >= 0) start[edges[e * 7 + E.to] + 1]++;
}
for (let i = 0; i < n; i++) start[i + 1] += start[i];
const fill = start.slice();
const adjTo = new Int32Array(start[n]);
const adjCost = new Int32Array(start[n]);
const adjEdge = new Int32Array(start[n]);
// Bearing when leaving the start node and when arriving at the end node.
const adjOut = new Float32Array(start[n]);
const adjIn = new Float32Array(start[n]);
const edgePoints = (e) => {
  const pts = [[nodes[edges[e * 7] * 2], nodes[edges[e * 7] * 2 + 1]]];
  const end = e + 1 < m ? edges[(e + 1) * 7 + 6] : shape.length / 2;
  for (let j = edges[e * 7 + 6]; j < end; j++)
    pts.push([shape[j * 2], shape[j * 2 + 1]]);
  pts.push([nodes[edges[e * 7 + 1] * 2], nodes[edges[e * 7 + 1] * 2 + 1]]);
  return pts;
};
const bearing = ([x1, y1], [x2, y2]) => Math.atan2(y2 - y1, (x2 - x1) * 0.64);
const setBearings = (i, pts) => {
  adjOut[i] = bearing(pts[0], pts[1]);
  adjIn[i] = bearing(pts.at(-2), pts.at(-1));
};
for (let e = 0; e < m; e++) {
  const a = edges[e * 7 + E.from];
  const b = edges[e * 7 + E.to];
  if (edges[e * 7 + E.fwd] >= 0) {
    adjTo[fill[a]] = b;
    adjCost[fill[a]] = costOf(e, edges[e * 7 + E.fwd], 0);
    if (model === "brouter") setBearings(fill[a], edgePoints(e));
    adjEdge[fill[a]++] = e;
  }
  if (edges[e * 7 + E.bwd] >= 0) {
    adjTo[fill[b]] = a;
    adjCost[fill[b]] = costOf(e, edges[e * 7 + E.bwd], 1);
    if (model === "brouter") setBearings(fill[b], edgePoints(e).reverse());
    adjEdge[fill[b]++] = e;
  }
}

const lon = (i) => nodes[i * 2] / 1e5;
const lat = (i) => nodes[i * 2 + 1] / 1e5;
const meters = (lon1, lat1, lon2, lat2) =>
  Math.hypot(
    (lon2 - lon1) * 111_000 * Math.cos((lat1 * Math.PI) / 180),
    (lat2 - lat1) * 111_000,
  );
const tileKey = (x, y) =>
  `${Math.floor(x / tiles.tile)}_${Math.floor(y / tiles.tile)}`;
const nodeTile = new Array(n);
for (let i = 0; i < n; i++) nodeTile[i] = tileKey(lon(i), lat(i));

// Largest connected part, ignoring direction. Points snap only to it, so a
// snapped node is never an isolated bit of footway.
const component = new Int32Array(n).fill(-1);
const sizes = [];
{
  const undirected = Array.from({ length: n }, () => []);
  for (let e = 0; e < m; e++) {
    undirected[edges[e * 7]].push(edges[e * 7 + 1]);
    undirected[edges[e * 7 + 1]].push(edges[e * 7]);
  }
  for (let s = 0; s < n; s++) {
    if (component[s] >= 0) continue;
    const stack = [s];
    component[s] = sizes.length;
    let size = 0;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const v of undirected[u])
        if (component[v] < 0) ((component[v] = sizes.length), stack.push(v));
    }
    sizes.push(size);
  }
}
const main = sizes.indexOf(Math.max(...sizes));

// Grid of nodes for snapping and for "is this point inside our data".
const CELL = 0.01;
const grid = new Map();
for (let i = 0; i < n; i++) {
  const k = `${Math.floor(lon(i) / CELL)}_${Math.floor(lat(i) / CELL)}`;
  let list = grid.get(k);
  if (!list) grid.set(k, (list = []));
  list.push(i);
}
function nearest(x, y) {
  let best = -1;
  let d = Infinity;
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const i of grid.get(`${cx + dx}_${cy + dy}`) ?? []) {
        if (component[i] !== main) continue;
        const v = meters(x, y, lon(i), lat(i));
        if (v < d) {
          d = v;
          best = i;
        }
      }
  return { node: best, dist: d };
}

/** Street tiles within STREET_RADIUS_M of a point. */
function streetTiles(x, y) {
  const dLat = STREET_RADIUS_M / 111_000;
  const dLon = dLat / Math.cos((y * Math.PI) / 180);
  const out = new Set();
  for (const fx of [-1, 0, 1])
    for (const fy of [-1, 0, 1]) out.add(tileKey(x + fx * dLon, y + fy * dLat));
  return out;
}

/** A* from s to t. Edges above maxLevel are only used inside the street tiles. */
function astar(s, t, maxLevel, street) {
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heapN = [];
  const heapF = [];
  const push = (v, f) => {
    let i = heapN.length;
    heapN.push(v);
    heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapN[i] = heapN[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heapN[i] = v;
    heapF[i] = f;
  };
  const pop = () => {
    const top = heapN[0];
    const v = heapN.pop();
    const f = heapF.pop();
    const len = heapN.length;
    if (len) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= len) break;
        if (c + 1 < len && heapF[c + 1] < heapF[c]) c++;
        if (heapF[c] >= f) break;
        heapN[i] = heapN[c];
        heapF[i] = heapF[c];
        i = c;
      }
      heapN[i] = v;
      heapF[i] = f;
    }
    return top;
  };
  const h = (v) => meters(lon(v), lat(v), lon(t), lat(t)) * MIN_FACTOR;
  const touched = new Set();
  best[s] = 0;
  push(s, h(s));
  let settled = 0;
  while (heapN.length) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    settled++;
    touched.add(nodeTile[u]);
    if (u === t) break;
    for (let i = start[u]; i < start[u + 1]; i++) {
      const v = adjTo[i];
      const e = adjEdge[i];
      if (
        edges[e * 7 + E.level] > maxLevel &&
        !(street.has(nodeTile[u]) && street.has(nodeTile[v]))
      )
        continue;
      let c = best[u] + adjCost[i];
      if (model === "brouter" && prev[u] >= 0 && !((ways[e] >> 11) & 1))
        c += TURN_COST * (1 - Math.cos(adjOut[i] - adjIn[prev[u]]));
      if (c < best[v]) {
        best[v] = c;
        prev[v] = i;
        push(v, c + h(v));
      }
    }
  }
  if (!done[t]) return { reached: false, settled, touched };
  const path = [];
  for (let v = t; v !== s;) {
    const i = prev[v];
    path.push(adjEdge[i]);
    let u = -1;
    // The adjacency entry i belongs to the node u with start[u] <= i < start[u+1].
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (start[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    u = lo;
    v = u;
  }
  path.reverse();
  let length = 0;
  for (const e of path) length += edges[e * 7 + E.len];
  return { reached: true, cost: best[t], length, path, settled, touched };
}

/** Points of a path, for the overlap check. */
function pathPoints(path) {
  const pts = [];
  for (const e of path) {
    const a = edges[e * 7 + E.from];
    const b = edges[e * 7 + E.to];
    pts.push([lon(a), lat(a)]);
    for (
      let j = edges[e * 7 + E.shape];
      j < edges[(e + 1) * 7 + E.shape] && e + 1 < m;
      j++
    )
      pts.push([shape[j * 2] / 1e5, shape[j * 2 + 1] / 1e5]);
    pts.push([lon(b), lat(b)]);
  }
  return pts;
}

/** Points every ~10 m along a line. */
function densify(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const steps = Math.max(1, Math.ceil(meters(x1, y1, x2, y2) / 10));
    for (let k = 0; k < steps; k++)
      out.push([x1 + ((x2 - x1) * k) / steps, y1 + ((y2 - y1) * k) / steps]);
  }
  return out;
}

/** Share of line a within NEAR_M of line b. */
function coverage(a, b) {
  const C = 0.0005;
  const cells = new Set();
  for (const [x, y] of densify(b))
    cells.add(`${Math.floor(x / C)}_${Math.floor(y / C)}`);
  const pts = densify(a);
  let near = 0;
  for (const [x, y] of pts) {
    const cx = Math.floor(x / C);
    const cy = Math.floor(y / C);
    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++)
      for (let dy = -1; dy <= 1 && !hit; dy++)
        hit = cells.has(`${cx + dx}_${cy + dy}`);
    if (hit) near++;
  }
  return pts.length ? near / pts.length : 0;
}

const cacheFile = `${dir}/brouter-cache.json`;
let cache = {};
try {
  cache = JSON.parse(readFileSync(cacheFile, "utf8"));
} catch {}
async function brouter(a, b) {
  const key = `${a}|${b}`;
  if (key in cache) return cache[key];
  cache[key] = await fetchBrouter(a, b);
  writeFileSync(cacheFile, JSON.stringify(cache));
  return cache[key];
}
async function fetchBrouter(a, b) {
  const url = `${brouterUrl}/brouter?lonlats=${a[0]},${a[1]}|${b[0]},${b[1]}&profile=touring&alternativeidx=0&format=geojson`;
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const f = (await res.json()).features[0];
  return {
    length: Number(f.properties["track-length"]),
    coords: f.geometry.coordinates,
  };
}

/** Downloaded bytes: search part of every tile the search touched, geometry of tiles on the path. */
function download(result, maxLevel, street) {
  let bytes = 0;
  const level = (k) => (street.has(k) ? ALL : maxLevel);
  for (const k of new Set([...result.touched, ...street]))
    bytes += tiles.sizes[k]?.[level(k)]?.[0] ?? 0;
  const pathTiles = new Set();
  for (const e of result.path ?? [])
    pathTiles.add(nodeTile[edges[e * 7 + E.from]]);
  for (const k of pathTiles) bytes += tiles.sizes[k]?.[level(k)]?.[1] ?? 0;
  return bytes;
}

// Test legs: random town and village pairs, seeded.
let seed = 81;
const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const legs = [];
for (const [lo, hi] of BUCKETS) {
  let count = 0;
  for (let tries = 0; count < LEGS_PER_BUCKET && tries < 100_000; tries++) {
    const a = places[Math.floor(random() * places.length)];
    const b = places[Math.floor(random() * places.length)];
    const d = meters(a.lon, a.lat, b.lon, b.lat) / 1000;
    if (d < lo || d >= hi) continue;
    legs.push({ a, b, beelineKm: d });
    count++;
  }
}

const variants = [0, 1, 2, 3];
const results = [];
for (const leg of legs) {
  const pa = [leg.a.lon, leg.a.lat];
  const pb = [leg.b.lon, leg.b.lat];
  const br = await brouter(pa, pb);
  if (!br) continue;
  // Skip legs whose BRouter route leaves our data (the extract ends at the state border).
  const brPts = densify(br.coords.map((c) => [c[0], c[1]]));
  const outside =
    brPts.filter(([x, y]) => nearest(x, y).dist > 300).length / brPts.length;
  if (outside > 0.02) continue;

  const s = nearest(...pa).node;
  const t = nearest(...pb).node;
  const street = new Set([...streetTiles(...pa), ...streetTiles(...pb)]);
  const row = {
    name: `${leg.a.name} - ${leg.b.name}`,
    beelineKm: leg.beelineKm,
    brouterM: br.length,
  };

  let t0 = performance.now();
  const full = astar(s, t, ALL, new Set());
  row.full = {
    ms: performance.now() - t0,
    reached: full.reached,
    length: full.length,
    cost: full.cost,
    brouterCoverage: full.reached
      ? coverage(br.coords, pathPoints(full.path))
      : 0,
    bytes: download(full, ALL, new Set()),
    settled: full.settled,
  };
  for (const k of variants) {
    t0 = performance.now();
    const r = astar(s, t, k, street);
    row[k] = {
      ms: performance.now() - t0,
      reached: r.reached,
      length: r.length,
      cost: r.cost,
      sameAsFull:
        r.reached && full.reached
          ? coverage(pathPoints(full.path), pathPoints(r.path))
          : 0,
      brouterCoverage: r.reached ? coverage(br.coords, pathPoints(r.path)) : 0,
      bytes: download(r, k, street),
      settled: r.settled,
    };
  }
  results.push(row);
}
writeFileSync(`${dir}/results-${model}.json`, JSON.stringify(results, null, 1));

const q = (xs, p) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const pct = (v) => `${(v * 100).toFixed(0)} %`;
const mib = (v) => `${(v / 2 ** 20).toFixed(1)}`;
console.log(`${results.length} of ${legs.length} legs inside the data`);
console.log(
  "| Graph | Reached | Cost vs all streets (median / p90) | Same as all streets | BRouter route covered | Length vs BRouter | MiB gz per leg (median / p90) | Search ms (median / p90) |",
);
console.log("|---|---|---|---|---|---|---|---|");
const rows = [
  ["all streets", (r) => r.full],
  ...variants.map((k) => [`backbone ≤ ${tiles.levels[k]}`, (r) => r[k]]),
];
for (const [name, get] of rows) {
  const ok = results.filter((r) => get(r).reached && r.full.reached);
  const ratio = ok.map((r) => get(r).cost / r.full.cost);
  console.log(
    `| ${name} | ${pct(ok.length / results.length)} | ${q(ratio, 0.5).toFixed(3)} / ${q(ratio, 0.9).toFixed(3)} | ${pct(
      q(
        ok.map((r) => get(r).sameAsFull ?? 1),
        0.5,
      ),
    )} | ${pct(
      q(
        ok.map((r) => get(r).brouterCoverage),
        0.5,
      ),
    )} | ${q(
      ok.map((r) => get(r).length / r.brouterM),
      0.5,
    ).toFixed(2)} | ${mib(
      q(
        ok.map((r) => get(r).bytes),
        0.5,
      ),
    )} / ${mib(
      q(
        ok.map((r) => get(r).bytes),
        0.9,
      ),
    )} | ${q(
      ok.map((r) => get(r).ms),
      0.5,
    ).toFixed(0)} / ${q(
      ok.map((r) => get(r).ms),
      0.9,
    ).toFixed(0)} |`,
  );
}
for (const [lo, hi] of BUCKETS) {
  const b = results.filter(
    (r) => r.beelineKm >= lo && r.beelineKm < hi && r.full.reached,
  );
  console.log(
    `${lo}-${hi} km (${b.length} legs): BRouter covered by all streets ${pct(
      q(
        b.map((r) => r.full.brouterCoverage),
        0.5,
      ),
    )}; ` +
      variants
        .map(
          (k) =>
            `≤${k}: cost ${q(
              b.filter((r) => r[k].reached).map((r) => r[k].cost / r.full.cost),
              0.5,
            ).toFixed(3)}, ${mib(
              q(
                b.map((r) => r[k].bytes),
                0.5,
              ),
            )} MiB`,
        )
        .join("; "),
  );
}

// Long routes across the state, as one search on all streets: data for a whole trip.
const LONG = [
  ["Kassel - Darmstadt", [9.479, 51.316], [8.651, 49.873]],
  ["Marburg - Fulda - Hanau", [8.77, 50.81], [8.917, 50.134]],
  ["Wiesbaden - Bad Hersfeld", [8.24, 50.08], [9.707, 50.869]],
];
for (const [name, a, b] of LONG) {
  const br = await brouter(a, b);
  const t0 = performance.now();
  const r = astar(nearest(...a).node, nearest(...b).node, ALL, new Set());
  if (!r.reached) {
    console.log(
      `${name}: not reached (snap ${nearest(...a).dist.toFixed(0)} m, ${nearest(...b).dist.toFixed(0)} m)`,
    );
    continue;
  }
  console.log(
    `${name}: ${(r.length / 1000).toFixed(0)} km (BRouter ${(br.length / 1000).toFixed(0)} km), ${(performance.now() - t0).toFixed(0)} ms, ` +
      `${r.touched.size} tiles, ${mib(download(r, ALL, new Set()))} MiB gz, BRouter route covered ${pct(coverage(br.coords, pathPoints(r.path)))}`,
  );
}

// The same trips the way the planner routes them: legs of about 10 km
// between points along the chosen path. Tiles loaded once per trip.
for (const [name, a, b] of LONG) {
  const br = await brouter(a, b);
  const pts = densify(br.coords.map((c) => [c[0], c[1]]));
  const waypoints = pts.filter((_, i) => i % 1000 === 0).concat([pts.at(-1)]);
  const touched = new Set();
  const pathTiles = new Set();
  let ms = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const t0 = performance.now();
    const r = astar(
      nearest(...waypoints[i - 1]).node,
      nearest(...waypoints[i]).node,
      ALL,
      new Set(),
    );
    ms += performance.now() - t0;
    for (const k of r.touched) touched.add(k);
    for (const e of r.path ?? [])
      pathTiles.add(nodeTile[edges[e * 7 + E.from]]);
  }
  let bytes = 0;
  for (const k of touched) bytes += tiles.sizes[k]?.[ALL]?.[0] ?? 0;
  for (const k of pathTiles) bytes += tiles.sizes[k]?.[ALL]?.[1] ?? 0;
  console.log(
    `${name} in ${waypoints.length - 1} legs: ${ms.toFixed(0)} ms, ${touched.size} tiles, ${mib(bytes)} MiB gz`,
  );
}
