# Routing spike: Hessen (#81)

Question: can the browser route on bikeable ways from static tiles, close to BRouter `touring`, without a router server?

Data: Geofabrik `hessen-latest.osm.pbf` (October 2026), Copernicus GLO-30 DEM. Throwaway code.

```sh
pnpm brouter                                    # local BRouter, for the comparison
cd pipeline
uv run spike/routing/build.py cache/osm/hessen-latest.osm.pbf spike/routing/out
node spike/routing/route.mjs spike/routing/out brouter
```

To check the real routing tiles (`pipeline/routing.py`) the same way:

```sh
uv run spike/routing/from_tiles.py <data dir> spike/routing/out/places.json spike/routing/out-tiles
node spike/routing/route.mjs spike/routing/out-tiles brouter
```

## How it works

- `build.py` reads all bikeable ways and splits them at junctions. It writes the graph as Int32 arrays and the gzipped size of each 0.25° tile.
- A tile has a search part (nodes, connections, one attribute byte, length) and a geometry part (shape points simplified to 5 m, elevation per point). The geometry part is only needed for tiles on the final route.
- `route.mjs` runs A* in Node on 141 town-to-town legs (3–60 km beeline) and on three long trips. It compares each route with BRouter `touring` on the same points.
- Cost models:

| Model | Cost |
|---|---|
| `rough` | Own guess per way type |
| `touring` | Way costs ported from `infra/brouter/profiles/touring.brf` |
| `brouter` | `touring` plus downhill cost (60 per m below 1.5 %, 10 m hysteresis) and turn cost (90 × (1 − cos angle), none on signed routes) |

- "Covered" is the share of the BRouter route within about 30–50 m of ours.

## Results

### Data

| Layer | km | Search part | Geometry part |
|---|---|---|---|
| Signed routes | 14,400 | 0.9 MiB | 0.4 MiB |
| + cycleways, paved tracks | 31,400 | 2.1 MiB | 1.0 MiB |
| + unclassified, tertiary | 38,700 | 2.7 MiB | 1.2 MiB |
| + residential | 60,400 | 4.7 MiB | 2.0 MiB |
| All bikeable ways | 192,400 | 11.3 MiB | 6.5 MiB |

Sizes gzipped. All bikeable ways: 68 tiles, median 0.27 MiB, largest 0.92 MiB. Germany is about 17 × the area of Hessen, so roughly 300 MiB.

### Quality and cost, all bikeable ways

| Model | BRouter route covered | Length vs BRouter | Search ms (median / p90) | MiB per leg (median / p90) |
|---|---|---|---|---|
| `rough` | 48 % | 0.91 | 5 / 46 | 1.1 / 3.0 |
| `touring` | 69 % | 0.97 | 4 / 32 | 1.0 / 2.8 |
| `brouter` | 83 % | 1.00 | 5 / 54 | 1.1 / 3.1 |

`brouter` by leg length: 96 % covered at 3–10 km, 84 % at 10–25 km, 71 % at 25–60 km.

### Two layers

Backbone everywhere plus all ways within 2 km of both ends, model `brouter`:

| Backbone | Cost vs all ways (median / p90) | BRouter route covered | MiB per leg (median / p90) |
|---|---|---|---|
| Signed routes | 1.000 / 1.061 | 78 % | 0.8 / 1.5 |
| + cycleways, paved tracks | 1.000 / 1.054 | 78 % | 0.9 / 1.7 |
| + unclassified, tertiary | 1.000 / 1.034 | 78 % | 0.9 / 1.7 |
| + residential | 1.000 / 1.016 | 82 % | 1.0 / 2.1 |
| All ways (one layer) | 1.000 / 1.000 | 83 % | 1.1 / 3.1 |

Two layers save less than 1 MiB per leg and make long legs worse.

### Whole trips, model `brouter`

| Trip | km (BRouter) | One search | Legs of 10 km, as the planner routes |
|---|---|---|---|
| Kassel – Darmstadt | 230 (230) | 363 ms, 10.1 MiB | 26 legs, 54 ms, 5.2 MiB |
| Marburg – Fulda – Hanau | 101 (100) | 76 ms, 4.9 MiB | 12 legs, 43 ms, 4.0 MiB |
| Wiesbaden – Bad Hersfeld | 181 (184) | 331 ms, 9.0 MiB | 21 legs, 31 ms, 4.8 MiB |

One long search covers only 42–56 % of the BRouter route at the same length: there are many routes of about equal cost.

## Verdict

- One layer of all bikeable ways is enough. Two layers add work and save little.
- A port of the `touring` profile with downhill and turn costs gives routes close to BRouter: same length, 83 % shared, 96 % on short legs.
- A trip loads about 5 MiB of tiles. A search takes milliseconds on a laptop.
- Static assets fit: about 300 MiB and a few hundred files for Germany.

## Not covered

- Phones: speed and memory.
- Decoding the binary tiles in the browser. The spike reads raw arrays.
- Turn restrictions, access and oneway penalties (oneways are blocked), node costs such as traffic signals, ferries.
- Cycle routes in super-relations count as unsigned.
- `fast`, `quiet` and `scenic`. `quiet` needs BRouter's traffic and noise estimates, which OSM does not have.
- Legs that leave Hessen (9 of 150 skipped).
- Build time: the descent step in plain Python takes 7 minutes for Hessen. Germany needs numpy.
