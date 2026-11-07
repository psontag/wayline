# Pipeline

Builds the route network and places for Germany from OSM data and the Copernicus DEM.

## Build

```sh
pnpm data:build
```

- Needs [uv](https://docs.astral.sh/uv/), Python 3.12 and [tippecanoe](https://github.com/felt/tippecanoe) 2.79 or newer (`brew install tippecanoe`; the Ubuntu package is too old, so build it from source as in `.github/workflows/ci.yml`). `build.sh` installs the packages from `requirements.txt` into `pipeline/.venv`. `uv run` in `pipeline/` uses that venv.
- Downloads missing inputs to `pipeline/cache/` (gitignored, about 8 GB): Geofabrik extracts of the 16 states (4.7 GB) and Copernicus GLO-30 tiles N47–N55, E005–E015 (2.8 GB).
- Writes `apps/web/public/data/<version>/` and `apps/web/public/data/latest.json` (gitignored). The version is `de-<date of the extracts>-<pipeline hash>`. The hash covers `pipeline/*.py` and `requirements.txt`, so a pipeline change gives a new version.
- Takes about 18 minutes and up to 5.5 GB of memory on a laptop: 3.5 for the download, 7 for scenery, 6 for routes and places. The extracts are cached, so the next build takes 2.5 minutes.
- `pnpm data:build --states hessen` builds one state.

Output (November 2026):

| | |
|---|---|
| Route network | 151,000 nodes, 203,000 edges, 212,000 km |
| Tiles | 226 files of 0.5°, 89 MiB (15 MiB gzipped), median 0.26 MiB, largest 2.5 MiB |
| Place tiles | 229 files, 9.8 MiB (2.3 MiB gzipped), largest 143 KiB: 39,300 towns, 5,900 stations, 38,000 hotels |
| `search.json` | 2.8 MiB (0.7 MiB gzipped): 31,800 towns and 5,900 stations on the network |
| Route lines | 5,000 files (1,493 empty), 15 MiB, largest 206 KiB |
| `routes.json` | 1.8 MiB: 16,300 routes |

A 200 km trip loads up to about 110 tiles, 53 MiB (9 MiB gzipped).

A trip around Heidelberg needs about 6 tiles, 4.4 MiB (0.7 MiB gzipped).

## Route lines

The map draws the signed routes from vector tiles, not from the network tiles.

- `lines/{z}/{x}/{y}.pbf`: one layer `routes`, zoom 5–11. MapLibre stretches zoom 11 for closer views.
- Inside the bounds in the manifest every tile exists, empty if no route runs there. The host answers a missing file with the app page, which the map can't read.
- Each line is a signed edge with `network` (its class) and `routes` (route ids as `|1|5|`, main route first).
- EuroVelo and national edges are in every zoom, regional ones from zoom 8, local ones from zoom 11. Every line stays in; neighbours are joined.
- `routes.json`: id, name, class, length and bbox of each route. Routes are keyed by name, so the relations of one route (e.g. one per state) count as one.
- A route's class is the best class of its OSM relations.
- `uv run lines.py <data_dir>` rebuilds them for a built dataset. Without the OSM relations, a route's class is the one with the most km. The Oberfranken mock is built this way.

## Scenery

Each edge has `scenery`: how much of it runs through forest, along water, through vineyards and in nature areas, and how many sights are near (`Scenery` in `packages/domain/src/geodata.ts`).

- `scenery.py` draws the areas and rivers of each class onto a grid of 50 m cells over the region.
- An edge's share of a class is the share of its points (every 50 m) on a cell of that class.
- Each class grows by a buffer, so edges next to a forest or along a river count too.

| Class | OSM tags | Buffer |
|---|---|---|
| `forest` | `landuse=forest`, `natural=wood` | 50 m |
| `water` | `waterway=river\|canal`, `natural=water` over 5 ha (not basins or wastewater) | 150 m |
| `vineyard` | `landuse=vineyard` | 100 m |
| `nature` | `leisure=nature_reserve`, `boundary=national_park`, `boundary=protected_area` with `protect_class` 1–4, and nature parks (`Naturpark` in name or `protection_title`) | none |
| `sights` | Named `historic=castle\|ruins\|monastery\|city_gate`, `tourism=attraction\|viewpoint\|museum` (nodes, and areas by their center) | counted within 500 m |

- Pillow draws areas about 25 m too large. The buffers above come on top.
- Landscape protection areas (`protect_class=5` without `Naturpark`) don't count. They cover about a third of the land.
- Nature parks are large and include towns, e.g. Heidelberg is in Geo-Naturpark Bergstraße-Odenwald.
- A state extract holds only the part of a relation inside the state. `scenery.py` joins the ways of such relations across the states. Areas that reach outside the region are dropped, except water: its open outline is closed with a straight line. So the Bodensee covers its German side.

Mean share per edge km, October 2026:

| forest | water | vineyard | nature |
|---|---|---|---|
| 0.43 | 0.17 | 0.01 | 0.31 |

Sights within 500 m, share of edges:

| 0 | 1 | 2–4 | 5–9 | 10+ |
|---|---|---|---|---|
| 63% | 18% | 13% | 4% | 2% |

## Routing tiles

`route/<x>_<y>.bin` and `route/<x>_<y>.geo.bin` hold all bikeable ways for the router in the browser (#81). `routing.py` builds them, the manifest lists them under `routing`.

- Bikeable: `highway` of a road, track, path or cycleway, or any way with `bicycle=yes|designated|permissive|dismount`. Not `bicycle=no|private|use_sidepath`, `access=no|private`, steps or areas.
- Ways split at junctions into edges. Only the largest connected part is kept.
- An edge is in the tile of each of its ends. Tiles are 0.25°.
- Elevation: the DEM at each point, and smoothed over 50 m samples (±4) for the profile.
- Descent per edge and direction: the DEM at each point with a 10 m dead band, minus 1.5 % of the length (like BRouter's `downhillcutoff`).
- Shape points: inner points of a way more than 1.5 m off the line of their neighbors.

Both files are gzipped. All numbers are little-endian. Coordinates are degrees × 10⁶. "Delta" means each value minus the one before, the first as is.

Search part (`.bin`):

| Field | Type | Count |
|---|---|---|
| `WRT1` | 4 bytes | |
| Nodes n, edges m | u32 | 2 |
| Node ids, ascending, delta | i32 | n |
| Lon, delta | i32 | n |
| Lat, delta | i32 | n |
| From node (index in this tile), delta | i32 | m |
| To node (index in this tile) | i32 | m |
| Length in m | u32 | m |
| Attributes | u16 | m |
| Descent from → to in dm | u16 | m |
| Descent to → from in dm | u16 | m |

Node ids are the same in all tiles, so tiles join at shared nodes. Ids follow the tiles, so ids in a tile are close.

Attributes:

| Bits | Value |
|---|---|
| 0–4 | Way type: index in `routing.highways` of the manifest, 31 for others |
| 5–7 | `tracktype` grade 1–5, 0 for none |
| 8 | Paved (`surface=paved\|asphalt\|concrete\|paving_stones\|sett` or `smoothness=excellent\|good`) |
| 9 | Unpaved, as BRouter's trekking profile |
| 10 | Bike: bike lane, `bicycle=yes\|permissive\|designated`, bicycle road or `lcn=yes` |
| 11 | On a signed cycle route |
| 12 | Allowed from → to |
| 13 | Allowed to → from |

Geometry part (`.geo.bin`), edges in the same order:

| Field | Type | Count |
|---|---|---|
| `WRG1` | 4 bytes | |
| Edges m, shape points p | u32 | 2 |
| Lon of each shape point, delta (first of an edge: to its from node) | i32 | p |
| Lat, same | i32 | p |
| Shape points per edge | u16 | m |
| Elevation in m: from node, shape points, to node of each edge | i16 | p + 2m |

## Files

| File | Does |
|---|---|
| `build.sh` | Sets up Python and runs `build.py` |
| `build.py` | Runs everything |
| `download.py` | Downloads the inputs |
| `extract.py` | Reads cycling routes, towns, stations and hotels from a PBF file |
| `scenery.py` | Reads forests, water, vineyards, nature areas and sights, and scores edges |
| `graph.py` | Builds the route graph (docs/05-trip-generation.md) |
| `dem.py` | Reads elevation from the DEM tiles |
| `export.py` | Writes nodes, edges and places in the format of `packages/domain/src/geodata.ts` |
| `lines.py` | Writes the vector tiles of the signed routes and `routes.json` |
| `routing.py` | Writes the routing tiles |
| `region.py` | States, DEM tiles and tile size |
| `check_area.py` | Checks the data around a station |
| `subset.py` | Copies the tiles of a bbox into a small dataset |

## Checks

```sh
cd pipeline
uv run check_area.py ../apps/web/public/data/<version> "Heidelberg Hauptbahnhof" 80 Mosbach Michelstadt Eppingen
```

Prints how much of the network within 80 km is connected to the station, the towns with hotels, and the best path to each named town.

## Test data

`apps/web/public/data/mock/heidelberg/` holds the 6 tiles around Heidelberg (8.0–9.5° E, 49–50° N) and the places in them. Tests use it. To refresh it:

```sh
cd pipeline
uv run subset.py ../apps/web/public/data/<version> ../apps/web/public/data/mock/heidelberg 8.0 49.0 9.49 49.99 Heidelberg
```

## Mock data

`apps/web/public/data/mock/oberfranken/` comes from the spike scripts in `spike/`. To regenerate it:

```sh
cd pipeline
uv run extract.py oberfranken-latest.osm.pbf extract.json
uv run spike/export_mock.py extract.json <dem-dir> ../apps/web/public/data/mock/oberfranken
```

- `oberfranken-latest.osm.pbf` is from Geofabrik.
- `<dem-dir>` holds the Copernicus GLO-30 tiles N49–N50, E010–E012.
